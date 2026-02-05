// K8s Daily Monitor - Jenkins CI Pipeline
// Buildkit 기반 Docker 이미지 빌드 및 Nexus 푸시

pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: buildkit
    image: moby/buildkit:latest
    command:
    - sleep
    args:
    - infinity
    securityContext:
      privileged: true
    volumeMounts:
    - name: buildkit-state
      mountPath: /var/lib/buildkit
  volumes:
  - name: buildkit-state
    emptyDir: {}
'''
        }
    }

    environment {
        // Nexus 레지스트리 설정
        REGISTRY = credentials('nexus-registry-url')  // 예: nexus.company.com:5000
        REGISTRY_CRED = credentials('nexus-registry-credentials')

        // 이미지 이름
        BACKEND_IMAGE = "${REGISTRY}/k8s-monitor/backend"
        FRONTEND_IMAGE = "${REGISTRY}/k8s-monitor/frontend"

        // 태그
        IMAGE_TAG = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"
        BRANCH_TAG = "${env.BRANCH_NAME?.replace('/', '-') ?: 'dev'}"
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('Build Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        container('buildkit') {
                            sh '''
                                buildctl build \
                                    --frontend dockerfile.v0 \
                                    --local context=./backend \
                                    --local dockerfile=./backend \
                                    --output type=image,name=${BACKEND_IMAGE}:${IMAGE_TAG},push=true \
                                    --export-cache type=inline \
                                    --import-cache type=registry,ref=${BACKEND_IMAGE}:cache
                            '''
                        }
                    }
                }

                stage('Build Frontend') {
                    steps {
                        container('buildkit') {
                            sh '''
                                buildctl build \
                                    --frontend dockerfile.v0 \
                                    --local context=./frontend \
                                    --local dockerfile=./frontend \
                                    --output type=image,name=${FRONTEND_IMAGE}:${IMAGE_TAG},push=true \
                                    --export-cache type=inline \
                                    --import-cache type=registry,ref=${FRONTEND_IMAGE}:cache
                            '''
                        }
                    }
                }
            }
        }

        stage('Tag Latest') {
            when {
                anyOf {
                    branch 'main'
                    branch 'master'
                }
            }
            steps {
                container('buildkit') {
                    sh '''
                        # Backend latest 태그
                        buildctl build \
                            --frontend dockerfile.v0 \
                            --local context=./backend \
                            --local dockerfile=./backend \
                            --output type=image,name=${BACKEND_IMAGE}:latest,push=true \
                            --import-cache type=registry,ref=${BACKEND_IMAGE}:${IMAGE_TAG}

                        # Frontend latest 태그
                        buildctl build \
                            --frontend dockerfile.v0 \
                            --local context=./frontend \
                            --local dockerfile=./frontend \
                            --output type=image,name=${FRONTEND_IMAGE}:latest,push=true \
                            --import-cache type=registry,ref=${FRONTEND_IMAGE}:${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('Update Manifests') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    def overlay = env.BRANCH_NAME == 'main' ? 'prod' : 'dev'

                    // Kustomize 이미지 태그 업데이트
                    sh """
                        cd k8s/overlays/${overlay}
                        kustomize edit set image \
                            k8s-daily-monitor/backend=${BACKEND_IMAGE}:${IMAGE_TAG} \
                            k8s-daily-monitor/frontend=${FRONTEND_IMAGE}:${IMAGE_TAG}
                    """

                    // Git commit & push (ArgoCD가 감지)
                    withCredentials([gitUsernamePassword(credentialsId: 'git-credentials')]) {
                        sh """
                            git config user.name "Jenkins CI"
                            git config user.email "jenkins@company.com"
                            git add k8s/overlays/${overlay}/kustomization.yaml
                            git commit -m "ci: update ${overlay} image to ${IMAGE_TAG}" || true
                            git push origin HEAD:${env.BRANCH_NAME} || true
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Build successful! Images pushed:"
            echo "  - ${BACKEND_IMAGE}:${IMAGE_TAG}"
            echo "  - ${FRONTEND_IMAGE}:${IMAGE_TAG}"
        }
        failure {
            echo "Build failed!"
        }
        always {
            cleanWs()
        }
    }
}
