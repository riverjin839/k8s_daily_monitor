.PHONY: help install dev build test clean docker-up docker-down

help:
	@echo "K8s Daily Monitor - Available commands:"
	@echo ""
	@echo "  make install      - Install all dependencies"
	@echo "  make dev          - Start development servers"
	@echo "  make build        - Build for production"
	@echo "  make test         - Run all tests"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make docker-up    - Start Docker Compose"
	@echo "  make docker-down  - Stop Docker Compose"
	@echo ""

# Install dependencies
install:
	@echo "Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Done!"

# Development
dev:
	@echo "Starting development servers..."
	@make -j2 dev-backend dev-frontend

dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# Build
build:
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "Done!"

# Test
test:
	@echo "Running backend tests..."
	cd backend && pytest -v
	@echo "Running frontend lint..."
	cd frontend && npm run lint

# Clean
clean:
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf backend/__pycache__
	rm -rf backend/.pytest_cache
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

# Docker
docker-up:
	docker-compose up -d
	@echo "Services started. Frontend: http://localhost:5173, API: http://localhost:8000"

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-rebuild:
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d
