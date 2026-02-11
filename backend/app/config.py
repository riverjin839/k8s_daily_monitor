from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "K8s Daily Monitor"
    debug: bool = False
    
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/k8s_monitor"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    
    # Ansible
    ansible_playbook_dir: str = "/app/ansible/playbooks"
    ansible_inventory_dir: str = "/app/ansible/inventory"
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Health Check
    check_interval_minutes: int = 5
    check_timeout_seconds: int = 30

    # AI Agent (Ollama)
    ollama_url: str = "http://ollama.monitoring.svc:11434"
    ollama_model: str = "llama3"
    ollama_timeout: int = 120
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
