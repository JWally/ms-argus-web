// pipeline/pipeline-stack.ts
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  CodePipeline,
  CodePipelineSource,
  CodeBuildStep,
  ManualApprovalStep,
} from "aws-cdk-lib/pipelines";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { AppStage } from "./pipeline-stages";
import { PIPELINE, GITHUB_REPO, GITHUB_BRANCH, CODESTAR_CONNECTION_ARN } from "./constants";

export interface PipelineStackProps extends StackProps {
  rootDomain: string;
  siteDomain: string;
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { rootDomain, siteDomain } = props;

    /* --------------------------------------------------
     *  Validate CodeStar Connection ARN
     * -------------------------------------------------- */
    if (!CODESTAR_CONNECTION_ARN) {
      console.warn(`
╔════════════════════════════════════════════════════════════════════════════╗
║  WARNING: CODESTAR_CONNECTION_ARN environment variable is not set!         ║
║                                                                            ║
║  To deploy the pipeline, you need a GitHub CodeStar Connection:            ║
║  1. Go to AWS Console -> CodePipeline -> Settings -> Connections           ║
║  2. Create a new GitHub connection (or use an existing one)                ║
║  3. Set the environment variable:                                          ║
║     export CODESTAR_CONNECTION_ARN="arn:aws:codestar-connections:..."      ║
║  4. Re-run the deployment                                                  ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
      throw new Error("CODESTAR_CONNECTION_ARN environment variable is required for pipeline deployment");
    }

    /* --------------------------------------------------
     *  Source: GitHub repository via CodeStar Connection
     * -------------------------------------------------- */
    const source = CodePipelineSource.connection(GITHUB_REPO, GITHUB_BRANCH, {
      connectionArn: CODESTAR_CONNECTION_ARN,
    });

    /* --------------------------------------------------
     *  Pipeline skeleton + synth
     * -------------------------------------------------- */
    const pipeline = new CodePipeline(this, id, {
      crossAccountKeys: true,
      synth: new CodeBuildStep("Synth", {
        input: source,
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          environmentVariables: {
            NODE_VERSION: { value: "22" },
          },
        },
        commands: [
          "n $NODE_VERSION",
          "npm ci",
          "npm run build",
          "npx cdk synth",
        ],
        rolePolicyStatements: [
          new PolicyStatement({
            actions: ["route53:ListHostedZonesByName"],
            resources: ["*"],
          }),
        ],
      }),
    });

    /* --------------------------------------------------
     *  Stage loop: QA -> UAT -> Prod
     * -------------------------------------------------- */
    PIPELINE.forEach((PIPE_STAGE, ndx) => {
      const stage = new AppStage(
        this,
        PIPE_STAGE.name,
        rootDomain,
        {
          env: { account: props.env?.account, region: PIPE_STAGE.region },
        },
        siteDomain,
      );

      const deploy = pipeline.addStage(stage);

      // Manual approval gates between stages
      // QA -> Uat -> Prod
      if (ndx < PIPELINE.length - 1) {
        deploy.addPost(new ManualApprovalStep(`PromoteFrom${PIPE_STAGE.name}`));
      }
    });
  }
}
