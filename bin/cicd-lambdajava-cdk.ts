#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CicdLambdajavaCdkStack } from '../lib/cicd-lambdajava-cdk-stack';

const app = new cdk.App();
new CicdLambdajavaCdkStack(app, 'CicdLambdajavaCdkStack');
