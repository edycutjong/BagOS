/**
 * Security middleware — API key authentication.
 *
 * TypeScript equivalent of shared/middleware.py.
 *
 * Every POST request to the A2A endpoint is blocked unless it carries a valid
 * X-API-Key header.  The agent card endpoint is always public — callers need
 * it to discover security requirements before they can authenticate.
 *
 * In production, load keys from environment variables or a secrets manager
 * (e.g. Azure Key Vault, AWS Parameter Store) rather than relying on defaults.
 */

import { Request, Response, NextFunction } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';

// ---------------------------------------------------------------------------
// Valid API keys.
// Set API_KEY_PRIMARY / API_KEY_SECONDARY in your .env for production use.
// ---------------------------------------------------------------------------
export const VALID_API_KEYS: Set<string> = new Set(
    [
        process.env['API_KEY_PRIMARY'] ?? 'my-secret-key-123',
        process.env['API_KEY_SECONDARY'] ?? 'another-valid-key',
    ].filter(Boolean),
);

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

export function apiKeyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    // The agent card endpoint is always public — callers need it to discover the
    // agent's security requirements before they know to send a key.
    if (
        req.path === `/${AGENT_CARD_PATH}` ||
        req.path.endsWith('/agent-card.json')
    ) {
        next();
        return;
    }

    const rawKey = req.headers['x-api-key'];
    const apiKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!apiKey) {
        console.warn(
            `security_rejected_missing_api_key path=${req.path} method=${req.method}`,
        );
        res.status(401).json({
            error: 'Unauthorized',
            detail: 'X-API-Key header is required',
        });
        return;
    }

    if (!VALID_API_KEYS.has(apiKey)) {
        console.warn(
            `security_rejected_invalid_api_key path=${req.path} method=${req.method} key_prefix=${apiKey.slice(0, 6)}`,
        );
        res.status(403).json({
            error: 'Forbidden',
            detail: 'Invalid API key',
        });
        return;
    }

    console.info(
        `security_authorized path=${req.path} method=${req.method} key_prefix=${apiKey.slice(0, 6)}`,
    );
    next();
}
