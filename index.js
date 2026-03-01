const express = require("express");

const app = express();

app.use(express.json());

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/api/v1/calculate", (req, res, next) => {
  try {
    const { expression } = req.body ?? {};

    if (typeof expression !== "string" || expression.trim().length === 0) {
      return res.status(400).json({
        error: {
          message: "Expression must be a non-empty string.",
          status: 400
        }
      });
    }

    const result = evaluateExpression(expression);

    return res.status(200).json({
      expression,
      result
    });
  } catch (error) {
    return next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: "Route not found",
      status: 404
    }
  });
});

app.use((error, req, res, next) => {
  const status = Number.isInteger(error?.status) ? error.status : 500;

  res.status(status).json({
    error: {
      message: error?.message || "Internal server error",
      status
    }
  });
});

const port = Number.parseInt(process.env.PORT, 10) || 3000;

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

function evaluateExpression(expression) {
  const normalized = expression.replace(/\s+/g, "");

  if (normalized.length === 0) {
    const error = new Error("Expression cannot be empty.");
    error.status = 400;
    throw error;
  }

  if (!/^[0-9+\-*/().]+$/.test(normalized)) {
    const error = new Error("Expression contains invalid characters.");
    error.status = 400;
    throw error;
  }

  const hasConsecutiveOperators = /[+\-*/]{2,}/.test(normalized);
  if (hasConsecutiveOperators) {
    const error = new Error("Expression has invalid operator sequence.");
    error.status = 400;
    throw error;
  }

  const result = computeWithShuntingYard(normalized);

  if (!Number.isFinite(result)) {
    const error = new Error("Expression could not be evaluated.");
    error.status = 400;
    throw error;
  }

  return result;
}

function computeWithShuntingYard(expression) {
  const tokens = tokenize(expression);
  const output = [];
  const operators = [];

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token.value);
      continue;
    }

    if (token.type === "operator") {
      while (operators.length > 0) {
        const top = operators[operators.length - 1];

        if (top.type !== "operator") {
          break;
        }

        if (
          precedenceOf(top.value) >= precedenceOf(token.value)
        ) {
          output.push(operators.pop().value);
          continue;
        }

        break;
      }

      operators.push(token);
      continue;
    }

    if (token.type === "leftParen") {
      operators.push(token);
      continue;
    }

    if (token.type === "rightParen") {
      let foundLeftParen = false;

      while (operators.length > 0) {
        const top = operators.pop();
        if (top.type === "leftParen") {
          foundLeftParen = true;
          break;
        }
        output.push(top.value);
      }

      if (!foundLeftParen) {
        const error = new Error("Mismatched parentheses.");
        error.status = 400;
        throw error;
      }
    }
  }

  while (operators.length > 0) {
    const top = operators.pop();
    if (top.type === "leftParen") {
      const error = new Error("Mismatched parentheses.");
      error.status = 400;
      throw error;
    }
    output.push(top.value);
  }

  return evaluateRpn(output);
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (isDigit(char) || (char === "." && isDigit(expression[index + 1]))) {
      let number = char;
      index += 1;

      while (index < expression.length) {
        const next = expression[index];
        if (!isDigit(next) && next !== ".") {
          break;
        }
        number += next;
        index += 1;
      }

      const value = Number.parseFloat(number);

      if (Number.isNaN(value)) {
        const error = new Error("Invalid number in expression.");
        error.status = 400;
        throw error;
      }

      tokens.push({ type: "number", value });
      continue;
    }

    if (char === "-" && (tokens.length === 0 || isUnaryPosition(tokens[tokens.length - 1]))) {
      const next = expression[index + 1];
      if (isDigit(next) || next === ".") {
        let number = char;
        index += 1;
        while (index < expression.length) {
          const nextChar = expression[index];
          if (!isDigit(nextChar) && nextChar !== ".") {
            break;
          }
          number += nextChar;
          index += 1;
        }

        const value = Number.parseFloat(number);
        if (Number.isNaN(value)) {
          const error = new Error("Invalid number in expression.");
          error.status = 400;
          throw error;
        }

        tokens.push({ type: "number", value });
        continue;
      }
    }

    if (isOperator(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen", value: char });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen", value: char });
      index += 1;
      continue;
    }

    const error = new Error("Invalid character in expression.");
    error.status = 400;
    throw error;
  }

  return tokens;
}

function evaluateRpn(tokens) {
  const stack = [];

  for (const token of tokens) {
    if (typeof token === "number") {
      stack.push(token);
      continue;
    }

    if (stack.length < 2) {
      const error = new Error("Invalid expression.");
      error.status = 400;
      throw error;
    }

    const right = stack.pop();
    const left = stack.pop();

    const result = applyOperator(left, right, token);
    stack.push(result);
  }

  if (stack.length !== 1) {
    const error = new Error("Invalid expression.");
    error.status = 400;
    throw error;
  }

  return stack[0];
}

function applyOperator(left, right, operator) {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) {
        const error = new Error("Division by zero.");
        error.status = 400;
        throw error;
      }
      return left / right;
    default: {
      const error = new Error("Unsupported operator.");
      error.status = 400;
      throw error;
    }
  }
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isOperator(char) {
  return char === "+" || char === "-" || char === "*" || char === "/";
}

function precedenceOf(operator) {
  if (operator === "+" || operator === "-") {
    return 1;
  }

  if (operator === "*" || operator === "/") {
    return 2;
  }

  return 0;
}

function isUnaryPosition(previousToken) {
  return previousToken.type === "operator" || previousToken.type === "leftParen";
}
