import * as cdk from '@aws-cdk/core';
import {App, Stack, StackProps, Duration} from "@aws-cdk/core";
import {Peer, Port, SecurityGroup, SubnetType, Vpc} from '@aws-cdk/aws-ec2'
import lambda = require('@aws-cdk/aws-lambda');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import apigateway = require('@aws-cdk/aws-apigateway');
import codedeploy = require('@aws-cdk/aws-codedeploy');
import ssm = require('@aws-cdk/aws-ssm');
import { HostedZone, ARecord, IHostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import certmgr = require('@aws-cdk/aws-certificatemanager')
import * as targets from '@aws-cdk/aws-route53-targets';

interface AppLambdaJavaStackProps extends StackProps {
  stage?: string;
}

export class AppLambdaJavaStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props: AppLambdaJavaStackProps) {
    super(scope, id, props);

    //== prebaciti van stack-a
/*
    const vpc = Vpc.fromLookup(this, 'vpc' , { 
      vpcId: 'vpc-cb0996a0',
      isDefault: true 
    });

    const defaultSG = SecurityGroup.fromSecurityGroupId(this,'defaultSG','sg-ab1ff0c4',{
      // mutable: true
    });
    
    //==
    */

/*
    const dbMoPass = ssm.StringParameter.fromStringParameterAttributes(this, 'DbMoPass', {
      parameterName: '/prod/db/mysql/dbmo_master/password',
      // 'version' can be specified but is optional.
    }).stringValue;

*/

    /**
     * S3
     */

    const bucketName = process.env.S3_LAMBDA_BUCKET?process.env.S3_LAMBDA_BUCKET:"LambdaBucket";
    const lambdaBucket = s3.Bucket.fromBucketName(this,'LambdaBucket',bucketName);
    
    /**
     * LAMBDA
     */  

    // demo lambda
    const demoLambda = new lambda.Function(this, 'demoLambda', {
      description: `Generated on: ${new Date().toISOString()}`,
      //vpc: vpc,
      //securityGroups: [defaultSG],
      runtime: lambda.Runtime.JAVA_11,
      handler: 'io.quarkus.amazon.lambda.runtime.QuarkusStreamHandler::handleRequest',
      code: lambda.Code.fromBucket(lambdaBucket,process.env.S3_LAMBDA_PREFIX! + '/demo-runner.jar'),
      /*environment: {
        MOADMIN_DB_URL : dbMoUrl,
        MOADMIN_DB_USER : dbMoUser,
        MOADMIN_DB_PASS : dbMoPass
      },*/
      timeout: Duration.seconds(60),
      memorySize: 1536

    });
    const demoVersion = demoLambda.addVersion(new Date().toISOString());
    const demoAlias = new lambda.Alias(this, 'demoLambdaAlias', {
      aliasName: 'Prod',
      version: demoVersion
    });
      
    new codedeploy.LambdaDeploymentGroup(this, 'demoDeploymentGroup', {
      alias: demoAlias,
      deploymentConfig: codedeploy.LambdaDeploymentConfig.ALL_AT_ONCE,
    });


    // demo lambda
    const dynamoLambda = new lambda.Function(this, 'dynamoLambda', {
      description: `Generated on: ${new Date().toISOString()}`,
      //vpc: vpc,
      //securityGroups: [defaultSG],
      runtime: lambda.Runtime.JAVA_11,
      handler: 'io.quarkus.amazon.lambda.runtime.QuarkusStreamHandler::handleRequest',
      code: lambda.Code.fromBucket(lambdaBucket,process.env.S3_LAMBDA_PREFIX! + '/dynamotest-runner.jar'),
      /*environment: {
        MOADMIN_DB_URL : dbMoUrl,
        MOADMIN_DB_USER : dbMoUser,
        MOADMIN_DB_PASS : dbMoPass
      },*/
      timeout: Duration.seconds(60),
      memorySize: 1536

    });
    const dynamoLambdaVersion = demoLambda.addVersion(new Date().toISOString());
    const dynamoLambdaAlias = new lambda.Alias(this, 'dynamoLambdaAlias', {
      aliasName: 'Prod',
      version: dynamoLambdaVersion
    });
      
    new codedeploy.LambdaDeploymentGroup(this, 'dynamoLambdaDeploymentGroup', {
      alias: dynamoLambdaAlias,
      deploymentConfig: codedeploy.LambdaDeploymentConfig.ALL_AT_ONCE,
    });


     /**
     * API gateway
     */

    const rootApi = new apigateway.RestApi(this, 'DemoApi', {
      restApiName: "DemoApi",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, //TODO promeni
      },
    });

    
    const moadminApi = rootApi.root.addResource('demoapi');

    //demo
    const demoMethod = moadminApi.addResource('demo').addMethod('POST', new apigateway.LambdaIntegration(demoLambda,{
      proxy: false
    }));
    //dynamo
    const dynamoMethod = moadminApi.addResource('dynamo').addMethod('POST', new apigateway.LambdaIntegration(dynamoLambda));

  }
}
