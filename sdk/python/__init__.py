"""
Vetran Python SDK
Trust infrastructure for AI agents.

Usage:
    import vetran

    agent = vetran.register(
        name="SchedulerAgent",
        owner="acme-corp",
        capabilities=["read:calendar", "write:calendar"]
    )

    result = vetran.verify(token=agent.token)
    if result.cleared:
        run_agent()
"""

from .client import VetranClient
from .models import Agent, VerifyResult, DelegationResult, StatusResult

# ── Default global client ────────────────────────────────────────────────────
_client: VetranClient = None


def _get_client() -> VetranClient:
    global _client
    if _client is None:
        _client = VetranClient()
    return _client


def configure(api_url: str = None, api_key: str = None, timeout: int = 10):
    """Configure the global Vetran client."""
    global _client
    _client = VetranClient(api_url=api_url, api_key=api_key, timeout=timeout)


# ── Top-level convenience functions ─────────────────────────────────────────

def register(
    name: str,
    owner: str,
    capabilities: list = None,
    model: str = None,
    description: str = None,
) -> Agent:
    """
    Register a new agent with the Vetran registry.

    Args:
        name:         Human-readable agent name
        owner:        Owning org or user identifier
        capabilities: List of capability strings e.g. ["read:calendar"]
        model:        AI model the agent uses e.g. "claude-sonnet-4"
        description:  Optional description of what this agent does

    Returns:
        Agent object with agentId, token, badge, capabilities, etc.
    """
    return _get_client().register(
        name=name,
        owner=owner,
        capabilities=capabilities,
        model=model,
        description=description,
    )


def verify(
    token: str,
    requested_capabilities: list = None,
) -> VerifyResult:
    """
    Verify an agent's identity token and check clearance.

    Args:
        token:                   The agent's JWT identity token
        requested_capabilities:  Capabilities this agent needs to execute

    Returns:
        VerifyResult with .verified, .cleared, .agent, .missing_capabilities
    """
    return _get_client().verify(
        token=token,
        requested_capabilities=requested_capabilities,
    )


def delegate(
    parent_token: str,
    child_agent_id: str,
    scoped_capabilities: list = None,
    expires_in: str = "24h",
) -> DelegationResult:
    """
    Delegate trust from a parent agent to a child agent.

    Args:
        parent_token:        The parent agent's JWT token
        child_agent_id:      The child agent's Vetran ID
        scoped_capabilities: Subset of parent's capabilities to delegate
        expires_in:          Token TTL e.g. "1h", "24h", "7d"

    Returns:
        DelegationResult with .delegation_id, .token, .chain, .scoped_capabilities
    """
    return _get_client().delegate(
        parent_token=parent_token,
        child_agent_id=child_agent_id,
        scoped_capabilities=scoped_capabilities,
        expires_in=expires_in,
    )


def status(agent_id: str) -> StatusResult:
    """
    Get the current standing of an agent in the Vetran registry.

    Args:
        agent_id: The agent's Vetran ID

    Returns:
        StatusResult with full agent details
    """
    return _get_client().status(agent_id=agent_id)


def revoke(agent_id: str, reason: str = None) -> dict:
    """
    Immediately revoke an agent. Blocks all future verifications.

    Args:
        agent_id: The agent's Vetran ID
        reason:   Optional reason for revocation

    Returns:
        Dict with revocation confirmation
    """
    return _get_client().revoke(agent_id=agent_id, reason=reason)


def ping() -> bool:
    """Check if the Vetran registry is reachable. Returns True if online."""
    return _get_client().ping()


__version__ = "1.0.0"
__all__ = [
    "configure", "register", "verify", "delegate",
    "status", "revoke", "ping",
    "VetranClient", "Agent", "VerifyResult", "DelegationResult", "StatusResult",
]
