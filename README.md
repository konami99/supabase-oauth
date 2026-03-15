# Supabase OAuth Server

A React app that serves as the OAuth authorization server UI for Supabase. Provides a login page and OAuth consent screen for third-party apps (e.g. an AgentCore agent) requesting access to user accounts.

## Routes

| Path | Description |
|------|-------------|
| `/login` | Email/password sign-in form |
| `/oauth/consent?authorization_id=<id>` | OAuth consent page; redirects to `/login` if unauthenticated |

## Tech Stack

- React 19 + TypeScript + Vite
- React Router v7
- Supabase JS SDK v2

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env`:
   ```env
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

3. Start dev server:
   ```bash
   npm run dev
   ```

---

## AgentCore Integration

This app is one piece of a larger integration connecting a user's Supabase identity to an Amazon Bedrock AgentCore agent. The full flow spans three components:

1. **This app (supabase-oauth)** — Supabase OAuth authorization server UI
2. **supabase-oauth-client** — Node.js client that triggers the OAuth flow and stores the token in AgentCore Identity vault
3. **AgentCore Runtime** — Agent runtime that retrieves the stored token and passes it to AgentCore Gateway

### Full Flow

```
[User Browser]
    │
    │  1. Click "supabase auth" button
    ▼
[supabase-oauth-client]  (Node.js / Express)
    │
    │  2. GET /auth-url
    │     → GetWorkloadAccessTokenForUserId(workloadName, userId=sessionId)
    │     → GetResourceOauth2Token(workloadToken, providerName, scopes)
    │        └─ token not yet in vault → returns authorizationUrl
    │
    │  3. Redirect browser to Supabase OAuth authorization URL
    ▼
[This app — /login]
    │
    │  4. User enters email + password
    │     → supabase.auth.signInWithPassword()
    │     → on success, navigate to /oauth/consent?authorization_id=<id>
    ▼
[This app — /oauth/consent]
    │
    │  5. supabase.auth.oauth.getAuthorizationDetails(authorizationId)
    │  6. User clicks Approve
    │     → supabase.auth.oauth.approveAuthorization(authorizationId)
    │     → Supabase redirects to supabase-oauth-client /callback
    ▼
[supabase-oauth-client — /callback]
    │
    │  7. CompleteResourceTokenAuth(sessionUri, userIdentifier: { userId })
    │     → AgentCore exchanges auth code for Supabase access token
    │     → Stores token in vault keyed by (workload, userId, credentialProvider, scopes)
    │
    │  8. GetResourceOauth2Token(workloadToken, providerName, scopes)
    │     → Token now in vault → returns accessToken directly
    ▼
[Token stored in AgentCore Identity vault]


[AgentCore Runtime — at agent invocation time]
    │
    │  payload: { prompt: "...", userId: "<supabase-user-uuid>" }
    │
    │  1. get_workload_access_token_for_user_id(workloadName, userId)
    │     → workloadAccessToken
    │
    │  2. @requires_access_token(workload_access_token=workloadAccessToken, ...)
    │     → IdentityClient.get_token() → GetResourceOauth2Token
    │     → vault lookup by (workload, userId, credentialProvider, scopes)
    │     → returns cached Supabase access token
    │
    │  3. MCPClient(headers={"Authorization": f"Bearer {supabaseToken}"})
    ▼
[AgentCore Gateway]
    │
    │  validates Supabase JWT via Supabase OIDC discovery URL
    ▼
[Lambda / MCP tools]
```

### Vault Key Structure

AgentCore Identity stores OAuth tokens keyed by:

```
(workload, userId, credentialProvider, scopes)
```

- **workload** — the `workloadName` registered in AgentCore
- **userId** — session ID cookie (from supabase-oauth-client) or Supabase UUID (`data.user.id` from password auth)
- **credentialProvider** — the `resourceCredentialProviderName` registered in AgentCore Identity
- **scopes** — the OAuth scopes requested (e.g. `["email"]`)

The same key is used for storage (OAuth callback) and retrieval (runtime), so the agent can look up any user's token using their `userId`.

### Retrieving `userId` after Supabase password login

```js
const { data } = await supabase.auth.signInWithPassword({ email, password })
const userId = data.user.id  // Supabase user UUID — same as JWT sub claim
```

Pass this UUID to `GetWorkloadAccessTokenForUserIdCommand` to look up the correct vault entry.

### AgentCore Runtime — token retrieval pattern

The runtime uses a custom `requires_access_token` decorator (from [tutorial 07](https://github.com/aws-samples/amazon-bedrock-agentcore-samples/tree/main/01-tutorials/03-AgentCore-identity/07-Outbound_Auth_3LO_ECS_Fargate)) that accepts `workload_access_token` explicitly, unlike the official decorator which reads it from `BedrockAgentCoreApp` context.

**Consent screen behavior:** The consent screen is only triggered when the token is not found in the vault. If a valid token is already cached (keyed by `workload + userId + credentialProvider + scopes`), it is returned directly and no consent is shown. Pass `on_auth_url` to handle the case where the token is missing — AgentCore will call it with the authorization URL so you can redirect the user through the login → consent flow. Without `on_auth_url`, a missing token will result in an error.

**What happens after the user approves consent:** Once the user approves, Supabase redirects to `supabase-oauth-client /callback`, which calls `CompleteResourceTokenAuthCommand` to exchange the auth code for a Supabase access token and store it in the vault. However, the runtime's `requires_access_token` decorator needs a `token_poller` to detect when the token lands in the vault and complete the current invocation. Without `token_poller`, the decorator fires `on_auth_url` and returns without a token — the vault is eventually populated, but the current call does not receive it.

To make the full round-trip work, add a `token_poller`:

```python
@requires_access_token(
    ...
    on_auth_url=lambda url: print(f"Authorization required. Visit: {url}"),
    token_poller=TokenPoller(interval=2, timeout=300),  # poll every 2s, up to 5 min
)
```

With `token_poller` in place, the full round-trip completes within the same runtime invocation:

1. Token not in vault → `on_auth_url` fires with the authorization URL
2. User completes login → consent → Supabase redirects to `supabase-oauth-client /callback`
3. `/callback` calls `CompleteResourceTokenAuthCommand` → token stored in vault
4. `token_poller` detects the token → `client.get_token()` returns it
5. Decorator injects the token → `get_supabase_token()` returns it
6. `MCPClient` sends `Authorization: Bearer <supabase_token>` to AgentCore Gateway

```python
def requires_access_token(
    *,
    provider_name: str,
    scopes: list[str],
    auth_flow: Literal["M2M", "USER_FEDERATION"],
    workload_access_token: str | None = None,
    base_url: str | None = None,
    on_auth_url: Callable[[str], Any] | None = None,
    force_authentication: bool = False,
    token_poller: TokenPoller | None = None,
    custom_state: str | None = None,
    custom_parameters: dict[str, str] | None = None,
    into: str = "access_token",
    region: str | None = None,
):
    def decorator(func):
        client = IdentityClient(region)

        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not workload_access_token:
                raise ValueError("workload_access_token is required")
            token = await client.get_token(
                provider_name=provider_name,
                agent_identity_token=workload_access_token,
                scopes=scopes,
                auth_flow=auth_flow,
                callback_url=base_url + "/oauth2/callback",
                on_auth_url=on_auth_url,
                force_authentication=force_authentication,
                token_poller=token_poller,
                custom_state=custom_state,
                custom_parameters=custom_parameters,
            )
            kwargs[into] = token
            return await func(*args, **kwargs)

        return wrapper
    return decorator
```

Usage in the runtime entrypoint:

```python
@app.entrypoint
async def invoke(payload, context=None):
    user_id = payload.get("userId")

    # Step 1: get per-user workload access token
    workload_resp = agentcore_client.get_workload_access_token_for_user_id(
        workloadName=WORKLOAD_NAME,
        userId=user_id,
    )

    # Step 2: retrieve Supabase token from vault
    # on_auth_url is called when token is not in vault — stores the authorization
    # URL so it can be returned to the caller for browser redirect
    # token_poller ensures the runtime waits for the user to complete consent
    # before continuing — required when token is not yet in vault
    auth_url_holder = {}

    def store_auth_url(url):
        auth_url_holder["url"] = url

    @requires_access_token(
        provider_name=CREDENTIAL_PROVIDER_NAME,
        scopes=["email"],
        auth_flow="USER_FEDERATION",
        workload_access_token=workload_resp["workloadAccessToken"],
        base_url=SITE_URL,
        region=REGION,
        on_auth_url=store_auth_url,
        token_poller=TokenPoller(interval=2, timeout=300),
    )
    async def get_supabase_token(*, access_token: str) -> str:
        return access_token

    supabase_token = await get_supabase_token()

    if not supabase_token and auth_url_holder.get("url"):
        return {"authorizationRequired": True, "authorizationUrl": auth_url_holder["url"]}

    # Step 3: pass Supabase token to AgentCore Gateway
    mcp_client = MCPClient(
        lambda: streamablehttp_client(
            url=gateway_url,
            headers={"Authorization": f"Bearer {supabase_token}"}
        )
    )
```
