import cdk = require('@aws-cdk/core');
import s3 = require('@aws-cdk/aws-s3');
import iam = require('@aws-cdk/aws-iam');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipelinex = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import {
    CloudFormationCreateUpdateStackAction,
    S3DeployAction
} from '@aws-cdk/aws-codepipeline-actions';
import {CloudFormationCapabilities} from '@aws-cdk/aws-cloudformation';
import { RemovalPolicy } from '@aws-cdk/core';
import {
    BuildEnvironmentVariableType,
    BuildSpec,
    ComputeType,
    LinuxBuildImage,
    PipelineProject
} from '@aws-cdk/aws-codebuild';
import {BlockPublicAccess, Bucket} from '@aws-cdk/aws-s3';
import {Duration} from '@aws-cdk/core';

export interface CicdLambdajavaProps extends cdk.StackProps {
    
    eJavaRepoName: string;
    eCdkStackName: string;
    eCdkRepoName: string;
    eServiceName: string;
    stage: string;
}

export class CicdLambdajavaCdkStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props: CicdLambdajavaProps) {
        super(scope, id, props);

        const pipelineName = props.eServiceName;
        const javaRepoName = props.eJavaRepoName;
        const cdkRepoName = props.eCdkRepoName;

        const lambdaBucket = new Bucket(this, `ARTIFACT-LAMBDA-${id}`, {
            versioned: false, 
            publicReadAccess: false,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
            lifecycleRules: [{
                expiration: Duration.days(1)
            }]
        });
        const artifactBucket = new Bucket(this, `ARTIFACT-CDK-${id}`, {
            versioned: false, 
            publicReadAccess: false,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
            lifecycleRules: [{
                expiration: Duration.days(1)
            }]
        });


         // PIPELINE
        const codePipeline = new codepipelinex.Pipeline(this, pipelineName, {           
            artifactBucket: artifactBucket,
        });



        //GITHUB
        const githubAccessToken = cdk.SecretValue.secretsManager('githubtoken');

        //SOURCE JAVA
        const sourceJavaOutput = new codepipelinex.Artifact('SourceJavaArtifact');
        const sourceJavaAction = new codepipeline_actions.GitHubSourceAction({
            
            actionName: 'GitHubJavaSource',
            owner: 'goranopacic',
            repo: javaRepoName,
            oauthToken: githubAccessToken,
            output: sourceJavaOutput,
            variablesNamespace: 'pipeline'
        });

        //SOURCE CDK
        const sourceCDKOutput = new codepipelinex.Artifact('SourceCDKArtifact');
        const sourceCDKAction = new codepipeline_actions.GitHubSourceAction({            
            actionName: 'GitHubCDKSource',
            owner: 'goranopacic',
            repo: cdkRepoName,
            oauthToken: githubAccessToken,
            output: sourceCDKOutput
        });

              
        codePipeline.addStage({
            stageName: 'Source',
            actions: [sourceJavaAction,sourceCDKAction],
        });

        //BUILD


        // BUILD JAVA

        const buildJavaProject = new codebuild.PipelineProject(this, 'CodeBuildJavaProject', {
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_2,
                privileged: true,

            },
            buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
            cache: codebuild.Cache.bucket(artifactBucket)
        });


        const buildJavaArtifact = new codepipelinex.Artifact('BuildJavaArtifact');
        const buildJavaAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'CodeBuildJava',
            project: buildJavaProject,
            input: sourceJavaOutput,
            outputs: [buildJavaArtifact],
            runOrder: 1,
            environmentVariables: {
                S3_LAMBDA_BUCKET : {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: lambdaBucket.bucketName
                },
                S3_LAMBDA_PREFIX  : {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: '#{codepipeline.PipelineExecutionId}'
                }      
            }

          });


        // BUILD CDK

        const buildCdkProject = new codebuild.PipelineProject(this, 'CodeBuildCdkProject', {
            cache: codebuild.Cache.bucket(artifactBucket),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
                privileged: true,
                
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: 10
                        },
                        commands: [
                            //'apt-get update',
                            //'apt-get install -y jq',
                            'npm install -g npm@6.4.1',
                            'npm install -g aws-cdk'
                        ]
                    },
                    build: {
                        commands: [
                            'npm ci',
                            'npm run build',
                            `cdk synth -o build ${props.eCdkStackName}`
                        ]
                    }
                },
                artifacts: {
                        'files': 'build/*',
                        'discard-paths' : 'yes'
                },
                cache: {
                    'paths': [
                        '/root/.m2/**/*',
                        '/root/.npm/**/*'
                    ]
                }
            })
        });

        buildCdkProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'cloudformation:DescribeStackResources',
                'ec2:*Describe*',
                'route53:ListHostedZonesByName'
            ],
            resources: ['*']
        }));


        const buildCdkArtifact = new codepipelinex.Artifact('BuildCdkArtifact');
        const buildCdkAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'CodeBuildCdk',
            project: buildCdkProject,
            input: sourceCDKOutput,
            extraInputs: [buildJavaArtifact],
            outputs: [buildCdkArtifact],
            runOrder: 2,
            environmentVariables: {
                S3_LAMBDA_BUCKET : {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: lambdaBucket.bucketName
                },
                S3_LAMBDA_PREFIX  : {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: '#{codepipeline.PipelineExecutionId}'
                }      
            }
          });

        codePipeline.addStage({
            stageName: 'Build',
            actions: [buildJavaAction,buildCdkAction],
        });


        const s3DeployAction = new S3DeployAction({
            actionName: 'CopyLambdasToS3',
            bucket: lambdaBucket!,
            input: buildJavaArtifact,
            runOrder: 1
        });

        const prodStackName = props.eCdkStackName;
        const updateAPIStackAction = new CloudFormationCreateUpdateStackAction({
            
            actionName: 'DeployLambda',
            templatePath: buildCdkArtifact.atPath(prodStackName + '.template.json'),
            adminPermissions: true,
            stackName: prodStackName,
            capabilities: [CloudFormationCapabilities.NAMED_IAM],
            runOrder: 2
            
        });


        codePipeline.addStage({
            stageName: 'Deploy',
            actions: [s3DeployAction,updateAPIStackAction],
        });



    }
}