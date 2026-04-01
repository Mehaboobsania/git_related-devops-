import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as path from 'path';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mongoUri = process.env.MONGODB_URI || '';

    // ── S3 Bucket for frontend hosting ──
    // ── S3 Bucket for frontend hosting ──
const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
  bucketName: `order-workflow-frontend-${this.account}`,
  websiteIndexDocument: 'index.html',
  websiteErrorDocument: 'index.html',
  publicReadAccess: true,
  blockPublicAccess: new s3.BlockPublicAccess({
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false
  }),
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  cors: [{
    allowedMethods: [s3.HttpMethods.GET],
    allowedOrigins: ['*'],
    allowedHeaders: ['*']
  }]
});

    // ── Deploy React build to S3 ──
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset('../frontend/build')],
      destinationBucket: frontendBucket
    });

    // ── S3 Bucket for order receipts ──
    const orderBucket = new s3.Bucket(this, 'OrderBucket', {
      bucketName: `order-workflow-receipts-${this.account}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // ── SQS Dead Letter Queue ──
    const dlq = new sqs.Queue(this, 'OrderDLQ', {
      queueName: 'order-dead-letter-queue',
      retentionPeriod: cdk.Duration.days(14)
    });

    // ── SNS Topic for notifications ──
    const orderTopic = new sns.Topic(this, 'OrderTopic', {
      topicName: 'order-notifications'
    });

    // ── Lambda functions ──
    const validateLambda = new lambda.Function(this, 'ValidateOrderFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas/validate')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONGODB_URI: mongoUri,
        ORDER_BUCKET: orderBucket.bucketName
      }
    });

    const chargeLambda = new lambda.Function(this, 'ChargePaymentFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas/charge')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONGODB_URI: mongoUri,
        ORDER_BUCKET: orderBucket.bucketName
      }
    });

    const fulfilLambda = new lambda.Function(this, 'FulfilOrderFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas/fulfil')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONGODB_URI: mongoUri,
        ORDER_BUCKET: orderBucket.bucketName
      }
    });

    const notifyLambda = new lambda.Function(this, 'NotifyCustomerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas/notify')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONGODB_URI: mongoUri,
        ORDER_BUCKET: orderBucket.bucketName
      }
    });

    // ── Step Functions Tasks ──
    const validateTask = new tasks.LambdaInvoke(this, 'ValidateOrder', {
      lambdaFunction: validateLambda,
      outputPath: '$.Payload'
    });

    const chargeTask = new tasks.LambdaInvoke(this, 'ChargePayment', {
      lambdaFunction: chargeLambda,
      outputPath: '$.Payload'
    });

    const fulfilTask = new tasks.LambdaInvoke(this, 'FulfilOrder', {
      lambdaFunction: fulfilLambda,
      outputPath: '$.Payload'
    });

    const notifyTask = new tasks.LambdaInvoke(this, 'NotifyCustomer', {
      lambdaFunction: notifyLambda,
      outputPath: '$.Payload'
    });

    // ── Failure state ──
    const orderFailed = new sfn.Fail(this, 'OrderFailed', {
      error: 'OrderProcessingFailed',
      cause: 'Order workflow failed - check error details'
    });

    // ── Success state ──
    const orderCompleted = new sfn.Succeed(this, 'OrderCompleted');

    // ── Chain the workflow ──
    const definition = validateTask
      .addCatch(orderFailed, { resultPath: '$.error' })
      .next(chargeTask
        .addCatch(orderFailed, { resultPath: '$.error' })
        .next(fulfilTask
          .addCatch(orderFailed, { resultPath: '$.error' })
          .next(notifyTask
            .addCatch(orderCompleted, { resultPath: '$.error' })
            .next(orderCompleted)
          )
        )
      );

    // ── State Machine ──
    const logGroup = new cdk.aws_logs.LogGroup(this, 'OrderWorkflowLogs', {
      logGroupName: '/aws/states/OrderWorkflow',
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const stateMachine = new sfn.StateMachine(this, 'OrderWorkflow', {
      stateMachineName: 'OrderWorkflow',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.EXPRESS,
      timeout: cdk.Duration.minutes(5),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true
      }
    });

    // ── API Gateway Lambda ──
    const apiLambda = new lambda.Function(this, 'ApiHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas/api')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONGODB_URI: mongoUri,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        ORDER_BUCKET: orderBucket.bucketName
      }
    });

    // ── Grant permissions ──
    stateMachine.grantStartExecution(apiLambda);
    stateMachine.grantRead(apiLambda);
    orderBucket.grantReadWrite(validateLambda);
    orderBucket.grantReadWrite(chargeLambda);
    orderBucket.grantReadWrite(fulfilLambda);
    orderBucket.grantReadWrite(notifyLambda);
    orderBucket.grantReadWrite(apiLambda);

    // ── API Gateway ──
    const api = new apigateway.RestApi(this, 'OrderApi', {
      restApiName: 'OrderWorkflowApi',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    const orders = api.root.addResource('orders');
    orders.addMethod('POST', new apigateway.LambdaIntegration(apiLambda));
    orders.addMethod('GET', new apigateway.LambdaIntegration(apiLambda));

    // ── Outputs ──
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: frontendBucket.bucketWebsiteUrl,
      description: 'React Frontend URL'
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL'
    });

    new cdk.CfnOutput(this, 'OrderBucketName', {
      value: orderBucket.bucketName,
      description: 'S3 Bucket for order receipts'
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Step Functions State Machine ARN'
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: dlq.queueUrl,
      description: 'Dead Letter Queue URL'
    });

    new cdk.CfnOutput(this, 'SNSTopicArn', {
      value: orderTopic.topicArn,
      description: 'SNS Topic ARN'
    });
  }
}