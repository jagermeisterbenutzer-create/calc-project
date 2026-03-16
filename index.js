const express = require('express');

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;

app.use(express.json());

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

const allowedExpressionPattern = /^[0-9+\-*/().\s]+$/;

const isValidExpression = (expression) => {
  if (typeof expression !== 'string') {
    return false;
  }

  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }

  if (!allowedExpressionPattern.test(trimmed)) {
    return false;
  }

  if (/[+\-*/.]\s*$/.test(trimmed)) {
    return false;
  }

  return true;
};

const sanitizeExpression = (expression) => {
  let sanitized = expression.replace(/\s+/g, '');
  sanitized = sanitized.replace(/^\++/, '');

  let previous;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/\(\)/g, '');
    sanitized = sanitized.replace(/\(\s*([+\-*/])\s*\)/g, '$1');
  } while (sanitized !== previous);

  return sanitized;
};

const evaluateExpression = (expression) => {
  const sanitized = sanitizeExpression(expression);
  const evaluator = new Function('return (' + sanitized + ')');
  return evaluator();
};

app.post('/api/v1/calculate', (req, res) => {
  const { expression } = req.body || {};

  if (!isValidExpression(expression)) {
    return res.status(400).json({ error: 'Invalid expression.' });
  }

  try {
    const result = evaluateExpression(expression);

    if (!Number.isFinite(result)) {
      return res.status(422).json({ error: 'Expression result is not finite.' });
    }

    return res.json({ expression, result });
  } catch (error) {
    return res.status(422).json({ error: 'Unable to evaluate expression.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(port, () => {
  console.log(`Calc backend listening on port ${port}`);
});
