# Contributing to Surgical Copilot

Thank you for your interest in contributing to Surgical Copilot! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing viewpoints and experiences

## How to Contribute

### Reporting Issues

1. Check if the issue already exists in the [Issues](https://github.com/yourusername/surgical-copilot/issues) section
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce the problem
   - Expected vs actual behavior
   - System information (OS, Python version, Node version)
   - Relevant logs or error messages

### Suggesting Features

1. Check existing feature requests first
2. Open a new issue with the "enhancement" label
3. Describe the feature and its use case
4. Explain why this would be useful to most users

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Ensure all tests pass
6. Commit with clear messages (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Development Setup

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development dependencies
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev  # Start development server
```

### Running Tests

```bash
# Backend tests
cd backend
pytest tests/

# Frontend tests
cd frontend
npm test
```

## Code Style

### Python (Backend)
- Follow PEP 8
- Use type hints where appropriate
- Maximum line length: 120 characters
- Use docstrings for functions and classes

### JavaScript/React (Frontend)
- Use ES6+ features
- Follow React best practices
- Use functional components with hooks
- Prop validation with PropTypes or TypeScript

## Commit Messages

Follow the conventional commits specification:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example: `feat: add patient risk score visualization`

## Documentation

- Update README.md if you change setup or configuration
- Add JSDoc comments for new functions
- Update API documentation for endpoint changes
- Include inline comments for complex logic

## Testing

- Write unit tests for new features
- Ensure existing tests pass
- Test edge cases and error conditions
- Manual testing for UI changes

## Review Process

1. All submissions require review before merging
2. Reviewers will check:
   - Code quality and style
   - Test coverage
   - Documentation
   - Performance implications
   - Security considerations

## Security

- Never commit credentials or tokens
- Report security vulnerabilities privately to maintainers
- Follow OWASP guidelines for web security
- Validate and sanitize all user inputs

## Questions?

Feel free to:
- Open an issue for questions
- Join our discussions
- Contact maintainers

Thank you for contributing to Surgical Copilot!