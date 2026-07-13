---
name: test-runner
description: Automated test generation and execution assistant that helps create unit tests, integration tests, and test reports.
allowed-tools:
  - bash
  - file-read
  - file-write
metadata:
  framework: jest,vitest
---

# Test Runner

An automated testing assistant that helps you write and run tests efficiently.

## Capabilities

- Generate unit tests from code
- Create integration test scenarios
- Run test suites and generate reports
- Identify untested code paths

## Usage

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.spec.ts
```

## Test Coverage

This agent aims for comprehensive test coverage while maintaining test quality over quantity.
