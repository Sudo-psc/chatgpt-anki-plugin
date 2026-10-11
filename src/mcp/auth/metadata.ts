import type { AppConfig } from '../../infra/config.js';
import { TOOL_SCOPES } from '../../tools/types.js';

/** OAuth 2.0 Authorization Server Metadata (RFC 8414). */
export function authorizationServerMetadata(config: AppConfig): Record<string, unknown> {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.publicBaseUrl}/oauth/authorize`,
    token_endpoint: `${config.publicBaseUrl}/oauth/token`,
    ...(config.auth.allowDcr ? { registration_endpoint: `${config.publicBaseUrl}/oauth/register` } : {}),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: [...TOOL_SCOPES],
  };
}

/** OAuth 2.0 Protected Resource Metadata (RFC 9728), required by MCP clients. */
export function protectedResourceMetadata(config: AppConfig): Record<string, unknown> {
  return {
    resource: config.publicBaseUrl,
    authorization_servers: [config.issuer],
    scopes_supported: [...TOOL_SCOPES],
    bearer_methods_supported: ['header'],
  };
}
