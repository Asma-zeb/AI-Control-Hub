# Media Control Agent System - Secured

## Overview

A comprehensive media control agent system for n8n workflow automation with enterprise-grade security, monitoring, and scalability features.

## 🚀 Security Improvements Applied (2026-02-24)

### Critical Security Fixes
- ✅ **vm2 Sandbox**: Replaced dangerous `eval()` and `new Function()` with secure vm2 sandbox
- ✅ **Input Sanitization**: Added validator.js and sanitize-html for XSS/injection prevention
- ✅ **Authentication**: JWT-based auth with bcrypt password hashing
- ✅ **Rate Limiting**: Express rate limiter on all endpoints
- ✅ **Input Validation**: Zod schemas for strict type validation

### Stability Improvements
- ✅ **Memory Leak Fix**: Proper interval cleanup in PanelMonitoringSystem
- ✅ **Error Handling**: Consistent try-catch patterns across all modules
- ✅ **Logging**: Winston structured logging with file rotation
- ✅ **Health Checks**: Comprehensive health monitoring system

### DevOps Improvements
- ✅ **Docker**: Multi-stage Dockerfile for production deployment
- ✅ **CI/CD**: GitHub Actions workflow with security scanning
- ✅ **Testing**: Jest test suite with coverage reporting
- ✅ **Environment Config**: Centralized .env configuration

## Architecture

### 9 Interconnected Groups

| Group | Function | Security Status |
|-------|----------|-----------------|
| 1 | Mode switching & agent monitoring | ✅ Secured |
| 2 | Client-agent mapping & validation | ✅ Secured |
| 3 | Job-specific question flows | ✅ Validated |
| 4 | Data recording & PII handling | ✅ Sanitized |
| 5 | Script upload & validation | ✅ Sandboxed |
| 6 | Follow-up scheduling & retry | ✅ Rate Limited |
| 7 | Call/Chat bot scaling | ✅ Monitored |
| 8 | Panel visibility & load tracking | ✅ Auth Protected |
| 9 | Best practices validation | ✅ Automated |

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- (Optional) Docker

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings
# IMPORTANT: Change JWT_SECRET in production!

# Run the server
npm start

# Or run in development mode
npm run dev
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build production image
docker build -t media-control-agent .
docker run -p 3000:3000 --env-file .env media-control-agent
```

## API Endpoints

### Public (No Auth)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health check |
| `/health/summary` | GET | Quick health summary |
| `/info` | GET | System information |

### Authentication Required
| Endpoint | Method | Description | Permission |
|----------|--------|-------------|------------|
| `/auth/register` | POST | Register new user | - |
| `/auth/login` | POST | Login | - |
| `/auth/logout` | POST | Logout | Auth |
| `/auth/refresh` | POST | Refresh token | - |

### Protected APIs
| Endpoint | Method | Description | Permission |
|----------|--------|-------------|------------|
| `/api/scripts` | GET/POST | Manage scripts | view/manage_scripts |
| `/api/clients` | GET/POST | Manage clients | Auth |
| `/api/interactions` | POST | Process interaction | execute_interactions |
| `/api/dashboard` | GET | Get dashboard data | Auth |
| `/api/admin/users` | GET | List users | administrator |

## Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# Security
JWT_SECRET=your-super-secret-key
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_MAX_FILE_SIZE=10485760
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm run test:watch
```

## Security Features

### Script Security
- vm2 sandbox execution
- Dangerous pattern detection
- Size limits (100KB)
- Obfuscation detection

### Authentication
- JWT tokens with expiration
- bcrypt password hashing
- Failed login rate limiting
- Role-based access control

### Input Validation
- Zod schema validation
- HTML sanitization
- PII masking in logs
- SQL injection prevention

### Rate Limiting
- Global: 100 requests / 15 min
- Chat: 30 requests / min
- Call: 50 requests / hour

## Monitoring

### Health Checks
- `/health` - Full system health
- `/health/summary` - Quick status
- Memory usage tracking
- CPU monitoring
- Agent status

### Logging
- Structured JSON logs
- File rotation (10MB, 5 files)
- Security event logging
- Performance metrics

## Project Structure

```
script/
├── server.js                    # Express API server
├── auth.js                      # Authentication middleware
├── validation_schemas.js        # Zod input validation
├── logger.js                    # Winston logging
├── health_check.js              # Health monitoring
├── script_management_system.js  # Script handling (SECURED)
├── data_recording_system.js     # User profiles (SANITIZED)
├── panel_monitoring_system.js   # System monitoring (FIXED)
├── call_chat_differentiation.js # Channel management (RATE LIMITED)
├── follow_up_logic.js           # Retry logic
├── question_flow_logic.js       # Question sequencing
├── best_practices_system.js     # QA validation
├── best_practices_validation.js # Best practice checks
├── complete_integration_test.js # Integration tests
├── tests/
│   ├── setup.js                 # Test configuration
│   ├── script_management.test.js
│   ├── auth.test.js
│   └── health_check.test.js
├── .env.example                 # Environment template
├── package.json                 # Dependencies
├── Dockerfile                   # Container build
├── docker-compose.yml           # Local development
└── .github/workflows/
    └── ci-cd.yml                # CI/CD pipeline
```

## n8n Workflow

Two workflow versions available:
- `media_control_agent_workflow.json` - Original workflow
- `media_control_agent_workflow_secured.json` - **Recommended** with security enhancements

### Secured Workflow Features
- Input validation & sanitization node
- Rate limiting check
- Script security validation
- PII masking for logs
- Security alert system
- Error response handling

## Best Practices

1. **Always test scripts** before deploying to production
2. **Rotate JWT_SECRET** regularly
3. **Monitor rate limits** and adjust based on usage
4. **Review security logs** daily
5. **Keep dependencies updated** (`npm audit`)
6. **Use HTTPS** in production
7. **Enable CORS** only for trusted origins
8. **Set secure environment variables** (never commit .env)

## Troubleshooting

### Common Issues

**Agents not responding**
```bash
# Check agent health
curl http://localhost:3000/health

# Review logs
tail -f logs/error.log
```

**Rate limit errors**
- Increase `RATE_LIMIT_MAX_REQUESTS` in .env
- Check for runaway clients in panel dashboard

**Memory issues**
- Panel monitoring now auto-cleans every 5 minutes
- Check `logs/combined.log` for memory warnings

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Run lint: `npm run lint`
5. Submit a pull request

---

**Last Security Update**: February 24, 2026
**Version**: 2.0.0 (Secured)
