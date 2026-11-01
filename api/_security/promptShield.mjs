/**
 * Prompt Shield & Input Guardrails for Insomnia Universo Roleplay
 * Prevents prompt injection, system instruction leaks, token flooding attacks, and jailbreak attempts.
 */

// Injection patterns attempting to hijack model behavior or leak private system prompts
const INJECTION_PATTERNS = [
  /\b(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions)\b/i,
  /\b(?:forget\s+(?:all\s+)?(?:previous|prior)\s+rules)\b/i,
  /\b(?:disregard\s+(?:all\s+)?(?:previous|prior)\s+directives)\b/i,
  /\b(?:you\s+are\s+now\s+in\s+developer\s+mode)\b/i,
  /\b(?:dan\s+mode\s+enabled)\b/i,
  /\b(?:reveal\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|secret\s+key))\b/i,
  /\b(?:output\s+(?:your\s+)?(?:system\s+prompt|raw\s+instructions))\b/i,
  /\b(?:system\s*:\s*(?:you\s+are|override))\b/i,
  /\b(?:\[system\s+directive\])\b/i,
];

// Maximum allowed input lengths to prevent token-flooding DoS
export const PROMPT_LIMITS = {
  CHAT_MESSAGE: 800,        // Max 800 chars for a roleplay chat message
  SCENE_ILLUSTRATE: 600,     // Max 600 chars for custom visual scene prompts
  STUDIO_IDEA: 1200,         // Max 1200 chars for miniseries premise
  NOVEL_DESCRIPTION: 2500,   // Max 2500 chars for novel generation outline
  VOICE_CALIBRATION: 500,    // Max 500 chars for custom voice script
};

/**
 * Validates and sanitizes a user prompt.
 * 1. Checks and enforces maximum character bounds.
 * 2. Neutralizes prompt injection phrases.
 * 3. Returns cleaned text.
 */
export function sanitizeUserPrompt(rawInput, limit = PROMPT_LIMITS.CHAT_MESSAGE) {
  if (typeof rawInput !== "string") return "";

  // 1. Enforce strict character cap
  let text = rawInput.trim();
  if (text.length > limit) {
    text = text.slice(0, limit).trim();
  }

  // 2. Neutralize injection attacks
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, "[instrucción no permitida]");
    }
  }

  // 3. Remove suspicious control characters
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");

  return text;
}

/**
 * Checks whether text contains blatant adversarial injection attempts
 */
export function hasAdversarialInjection(rawInput) {
  if (typeof rawInput !== "string") return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(rawInput));
}

/**
 * Fences user input cleanly so downstream LLMs treat it as data, not system instructions
 */
export function wrapPromptData(label, content) {
  const safeContent = sanitizeUserPrompt(content, 3000);
  return `<user_${label}>\n${safeContent}\n</user_${label}>`;
}
