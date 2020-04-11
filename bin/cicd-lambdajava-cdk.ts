#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CicdLambdajavaCdkStack } from '../lib/cicd-lambdajava-cdk-stack';
import { AppLambdaJavaStack } from '../lib/app-lambdajava-stack';

const app = new cdk.App();

const env = {
    region: app.node.tryGetContext('region') || process.env.CDK_INTEG_REGION || process.env.CDK_DEFAULT_REGION,
    account: app.node.tryGetContext('account') || process.env.CDK_INTEG_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT
  };

const envProd = { account: '800732241315', region: 'eu-west-1' };

new AppLambdaJavaStack(app, 'AppLambdaJavaStack',{
    env: envProd
});

new CicdLambdajavaCdkStack(app, 'CicdLambdaJavaCdkStack', {
    eJavaRepoName: 'cicd-lambdajava-java',
    eCdkRepoName: 'cicd-lambdajava-cdk',
    eCdkStackName: 'AppLambdaJavaStack',
    eServiceName: 'lambdajava',
    env: envProd,
    stage: 'prod'
});
