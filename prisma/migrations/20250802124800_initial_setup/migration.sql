-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('PROGRAMMING_LANGUAGE', 'FRAMEWORK', 'DATABASE', 'DEVOPS', 'OPERATING_SYSTEM');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'BETA');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "UserClusterRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EnvironmentStatus" AS ENUM ('CREATING', 'PROVISIONING', 'INSTALLING', 'CONFIGURING', 'RUNNING', 'STOPPED', 'STOPPING', 'RESTARTING', 'ERROR', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "subscription_plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "google_id" TEXT,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "account_locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "tags" TEXT[],
    "docker_image" TEXT NOT NULL,
    "default_port" INTEGER NOT NULL DEFAULT 8080,
    "default_resources_cpu" TEXT NOT NULL DEFAULT '500m',
    "default_resources_memory" TEXT NOT NULL DEFAULT '1Gi',
    "default_resources_storage" TEXT NOT NULL DEFAULT '10Gi',
    "environment_variables" JSONB NOT NULL DEFAULT '{}',
    "startup_commands" TEXT[],
    "documentation_url" TEXT,
    "icon_url" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'ovh',
    "region" TEXT NOT NULL,
    "kubeconfig" TEXT NOT NULL,
    "status" "ClusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "node_count" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_clusters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,
    "role" "UserClusterRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,
    "status" "EnvironmentStatus" NOT NULL DEFAULT 'CREATING',
    "docker_image" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8080,
    "web_port" INTEGER,
    "resources_cpu" TEXT NOT NULL DEFAULT '500m',
    "resources_memory" TEXT NOT NULL DEFAULT '1Gi',
    "resources_storage" TEXT NOT NULL DEFAULT '10Gi',
    "environment_variables" JSONB NOT NULL DEFAULT '{}',
    "installation_completed" BOOLEAN NOT NULL DEFAULT false,
    "external_url" TEXT,
    "kubernetes_namespace" TEXT,
    "kubernetes_pod_name" TEXT,
    "kubernetes_service_name" TEXT,
    "cpu_usage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "memory_usage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "storage_usage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_sessions" (
    "id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "tmux_session_name" TEXT,
    "client_info" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),

    CONSTRAINT "terminal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_logs" (
    "id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'container',
    "metadata" JSONB DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_metrics" (
    "id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "cpu_usage" DOUBLE PRECISION NOT NULL,
    "memory_usage" DOUBLE PRECISION NOT NULL,
    "storage_usage" DOUBLE PRECISION NOT NULL,
    "network_rx" BIGINT NOT NULL DEFAULT 0,
    "network_tx" BIGINT NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "templates_name_key" ON "templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "clusters_name_key" ON "clusters"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_clusters_user_id_cluster_id_key" ON "user_clusters"("user_id", "cluster_id");

-- CreateIndex
CREATE UNIQUE INDEX "environments_user_id_name_key" ON "environments"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_sessions_session_id_key" ON "terminal_sessions"("session_id");

-- CreateIndex
CREATE INDEX "environment_logs_environment_id_timestamp_idx" ON "environment_logs"("environment_id", "timestamp");

-- CreateIndex
CREATE INDEX "environment_metrics_environment_id_timestamp_idx" ON "environment_metrics"("environment_id", "timestamp");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clusters" ADD CONSTRAINT "user_clusters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clusters" ADD CONSTRAINT "user_clusters_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_logs" ADD CONSTRAINT "environment_logs_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_metrics" ADD CONSTRAINT "environment_metrics_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
