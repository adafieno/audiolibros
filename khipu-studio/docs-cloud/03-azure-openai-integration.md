# Azure OpenAI Integration Guide

## Why Azure OpenAI Service?

Azure OpenAI Service is the **preferred GenAI provider** for Khipu Cloud, offering superior integration with the Azure ecosystem and enterprise-grade features not available with the standard OpenAI API.

### Key Advantages

#### 🔐 **Enterprise Security**
- **Managed Identity**: Eliminate API keys from your code - use Azure AD authentication
- **Private Endpoints**: Keep AI traffic within your Azure Virtual Network
- **Content Filtering**: Built-in responsible AI filters for harmful content
- **Compliance**: Inherits Azure certifications (SOC 2, ISO 27001, HIPAA, GDPR)
- **Data Residency**: Deploy models in specific regions to meet sovereignty requirements

#### 💰 **Cost Optimization**
- **Unified Billing**: Single Azure invoice for all services (OpenAI + Storage + Database)
- **Provisioned Throughput**: Reserve capacity for predictable pricing at scale
- **Commitment Discounts**: Volume pricing for high-usage scenarios
- **Cost Management**: Azure Cost Management tools for tracking and alerts

#### ⚡ **Performance & Reliability**
- **Low Latency**: Direct Azure backbone connectivity (no internet hops)
- **99.9% SLA**: Enterprise-grade uptime guarantee
- **Rate Limit Management**: Dedicated capacity with no shared throttling
- **Regional Redundancy**: Deploy across multiple Azure regions

#### 🔧 **Developer Experience**
- **Unified SDK**: Same OpenAI Python SDK works with Azure (just change endpoint)
- **Function Calling**: Structured outputs for character detection
- **Streaming**: Real-time token streaming for responsive UX
- **Embeddings**: Native support for semantic search and RAG

---

## Architecture Integration

### Service Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                     Khipu Cloud API                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Character Service (FastAPI)                    │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Azure OpenAI Client (with Managed Identity)     │  │ │
│  │  │  • gpt-4o: Character detection & profiling       │  │ │
│  │  │  • gpt-4o-mini: Simple tasks (high volume)       │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│               ↓ (Managed Identity Auth)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │      Azure OpenAI Service (PaaS)                       │ │
│  │  • Deployment: gpt-4o (capacity: 10 TPM)               │ │
│  │  • Deployment: gpt-4o-mini (capacity: 50 TPM)          │ │
│  │  • Content filters: Violence, Hate, Self-harm          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Network Architecture

**Development**: Public endpoint with API key
**Production**: Private endpoint within Azure VNet + Managed Identity

```
┌─────────────────────────────────────────────────────────────┐
│                    Azure Virtual Network                    │
│                                                             │
│  ┌──────────────────┐         ┌────────────────────────┐    │
│  │  Container App   │────────>│  Private Endpoint      │    │
│  │  (Khipu API)     │         │  (Azure OpenAI)        │    │
│  │  Managed ID:     │         │  No public access      │    │
│  └──────────────────┘         └────────────────────────┘    │
│           ↓                                                 │
│  ┌──────────────────┐                                       │
│  │  PostgreSQL      │                                       │
│  │  (metadata)      │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Configuration

### Model Deployments

| Deployment Name | Model | Version | Capacity (TPM) | Use Case |
|-----------------|-------|---------|----------------|----------|
| **gpt-4o** | gpt-4o | 2024-08-06 | 10 | Character detection, complex analysis |
| **gpt-4o-mini** | gpt-4o-mini | 2024-07-18 | 50 | Simple tasks, high-volume operations |

**TPM**: Tokens Per Minute (1,000 TPM = 1K tokens/min)

### Provisioned Throughput (Optional)

For high-volume production workloads (>50K requests/day), consider provisioned throughput:

| Model | Provisioned Units (PTUs) | Cost | Throughput |
|-------|--------------------------|------|------------|
| **gpt-4o** | 100 PTUs | ~$750/month | ~20K tokens/min |
| **gpt-4o-mini** | 100 PTUs | ~$300/month | ~100K tokens/min |

**When to use**: 
- Predictable high-volume traffic
- Need guaranteed throughput (no rate limits)
- Cost savings over pay-per-token at scale

---

## Implementation Guide

### 1. Authentication Patterns

#### Option A: API Key (Development/Testing)

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version="2024-10-21",
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

response = client.chat.completions.create(
    model="gpt-4o",  # Deployment name
    messages=[{"role": "user", "content": "Detect characters in this text..."}]
)
```

#### Option B: Managed Identity (Production - RECOMMENDED)

```python
from azure.identity import DefaultAzureCredential
from openai import AzureOpenAI

# Automatically uses Managed Identity in Azure
credential = DefaultAzureCredential()
token = credential.get_token("https://cognitiveservices.azure.com/.default")

client = AzureOpenAI(
    azure_ad_token=token.token,
    api_version="2024-10-21",
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Detect characters..."}]
)
```

**Benefits of Managed Identity**:
- ✅ No secrets in environment variables or code
- ✅ Automatic credential rotation
- ✅ Azure RBAC for fine-grained permissions
- ✅ Audit logging through Azure AD

---

### 2. Character Detection with Function Calling

Azure OpenAI supports **function calling** (structured outputs) for reliable JSON extraction:

```python
character_detection_schema = {
    "name": "detect_characters",
    "description": "Extract characters from narrative text",
    "parameters": {
        "type": "object",
        "properties": {
            "characters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string", "enum": ["protagonist", "antagonist", "supporting", "narrator"]},
                        "description": {"type": "string"},
                        "gender": {"type": "string", "enum": ["male", "female", "neutral", "other"]},
                        "age_range": {"type": "string", "enum": ["child", "teen", "young_adult", "adult", "elderly"]}
                    },
                    "required": ["name", "role"]
                }
            }
        }
    }
}

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a literary analyst specializing in character extraction."},
        {"role": "user", "content": f"Extract characters from this text:\n\n{manuscript_text}"}
    ],
    functions=[character_detection_schema],
    function_call={"name": "detect_characters"},
    temperature=0.0  # Deterministic output
)

# Parse structured output
characters = json.loads(response.choices[0].message.function_call.arguments)
```

**Advantages**:
- ✅ Guaranteed JSON structure (no parsing errors)
- ✅ Type validation enforced by OpenAI
- ✅ Better reliability than regex/string parsing

---

### 3. Cost Tracking

Track Azure OpenAI usage in database:

```python
async def track_azure_openai_cost(
    db: AsyncSession,
    tenant_id: UUID,
    project_id: UUID,
    deployment: str,
    usage: dict
):
    """
    Record Azure OpenAI API usage and cost
    
    Args:
        deployment: 'gpt-4o' or 'gpt-4o-mini'
        usage: {
            'prompt_tokens': 2500,
            'completion_tokens': 350,
            'total_tokens': 2850
        }
    """
    # Pricing (as of Nov 2024)
    pricing = {
        'gpt-4o': {
            'input': 0.000005,   # $5 per 1M input tokens
            'output': 0.000015   # $15 per 1M output tokens
        },
        'gpt-4o-mini': {
            'input': 0.00000015,  # $0.15 per 1M input tokens
            'output': 0.0000006   # $0.60 per 1M output tokens
        }
    }
    
    rates = pricing[deployment]
    cost_usd = (
        usage['prompt_tokens'] * rates['input'] +
        usage['completion_tokens'] * rates['output']
    )
    
    cost_entry = CostEntry(
        tenant_id=tenant_id,
        project_id=project_id,
        service='azure_openai',
        operation=f'{deployment}_completion',
        azure_openai_deployment=deployment,
        prompt_tokens=usage['prompt_tokens'],
        completion_tokens=usage['completion_tokens'],
        total_tokens=usage['total_tokens'],
        cost_usd=cost_usd,
        metadata={
            'request_id': response.id,
            'model_version': response.model
        }
    )
    
    db.add(cost_entry)
    await db.commit()
```

---

### 4. Error Handling & Retries

```python
from tenacity import retry, stop_after_attempt, wait_exponential
from openai import AzureOpenAI, APIError, RateLimitError, APIConnectionError

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=lambda e: isinstance(e, (RateLimitError, APIConnectionError))
)
async def call_azure_openai(client: AzureOpenAI, **kwargs):
    """
    Call Azure OpenAI with automatic retries for transient errors
    """
    try:
        return client.chat.completions.create(**kwargs)
    except RateLimitError as e:
        # Log rate limit and retry
        logger.warning(f"Rate limit hit, retrying: {e}")
        raise
    except APIConnectionError as e:
        # Network error, retry
        logger.warning(f"Connection error, retrying: {e}")
        raise
    except APIError as e:
        # Non-retryable error (e.g., content filter)
        logger.error(f"API error: {e}")
        raise
```

---

### 5. Content Filtering

Azure OpenAI includes built-in content filters. Handle filtered responses:

```python
try:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[...]
    )
except Exception as e:
    if "content_filter" in str(e).lower():
        # Content was flagged by Azure's responsible AI filters
        return {
            "error": "Content flagged by safety filters",
            "details": "The input or output was flagged for policy violations"
        }
    raise
```

**Filter Categories**:
- Violence
- Hate speech
- Self-harm
- Sexual content

---

## Cost Optimization Strategies

### 1. Intelligent Model Selection

```python
async def detect_characters(manuscript_text: str, complexity: str = "auto"):
    """
    Choose appropriate model based on task complexity
    """
    # For simple/short manuscripts, use gpt-4o-mini (20x cheaper)
    if complexity == "auto":
        word_count = len(manuscript_text.split())
        deployment = "gpt-4o-mini" if word_count < 5000 else "gpt-4o"
    else:
        deployment = complexity
    
    response = await call_azure_openai(
        client=openai_client,
        model=deployment,
        messages=[...]
    )
    return response
```

**Savings**: 
- gpt-4o: $5/$15 per 1M tokens (input/output)
- gpt-4o-mini: $0.15/$0.60 per 1M tokens
- **20-25x cost reduction** for simple tasks

### 2. Prompt Optimization

Reduce token usage by optimizing prompts:

```python
# ❌ Inefficient (3000 tokens)
prompt = f"""
Extract all characters from this manuscript. For each character, provide:
- Full name
- Role in the story (protagonist, antagonist, etc.)
- Physical description
- Personality traits
...

Full manuscript:
{manuscript_text}  # 50,000 words
"""

# ✅ Efficient (500 tokens)
prompt = f"""
Extract characters (name, role, gender, age_range) from text below.

Text sample (first 2000 words):
{manuscript_text[:10000]}  # First 2000 words only
"""
```

### 3. Caching Strategy

Implement semantic caching to avoid redundant API calls:

```python
import hashlib

def generate_cache_key(prompt: str, model: str) -> str:
    """Generate cache key for prompt + model combination"""
    content = f"{model}:{prompt}"
    return hashlib.sha256(content.encode()).hexdigest()

async def cached_completion(prompt: str, model: str):
    cache_key = generate_cache_key(prompt, model)
    
    # Check cache
    cached = await redis.get(f"openai:{cache_key}")
    if cached:
        logger.info(f"Cache hit for {model}")
        return json.loads(cached)
    
    # Call API
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    
    # Store in cache (24 hour TTL)
    await redis.setex(
        f"openai:{cache_key}",
        86400,
        json.dumps(response.model_dump())
    )
    
    return response
```

---

## Monitoring & Observability

### Azure Monitor Integration

```python
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace

# Configure Application Insights
configure_azure_monitor(
    connection_string=os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
)

tracer = trace.get_tracer(__name__)

@tracer.start_as_current_span("azure_openai_character_detection")
async def detect_characters(manuscript_text: str):
    span = trace.get_current_span()
    
    # Add custom attributes
    span.set_attribute("manuscript.word_count", len(manuscript_text.split()))
    span.set_attribute("azure_openai.deployment", "gpt-4o")
    
    response = client.chat.completions.create(...)
    
    # Track tokens
    span.set_attribute("azure_openai.prompt_tokens", response.usage.prompt_tokens)
    span.set_attribute("azure_openai.completion_tokens", response.usage.completion_tokens)
    span.set_attribute("azure_openai.cost_usd", calculate_cost(response.usage))
    
    return response
```

### Key Metrics to Track

- **Latency**: p50, p95, p99 response times
- **Token Usage**: Prompt vs completion tokens
- **Cost**: Daily/monthly spend by deployment
- **Error Rate**: 4xx vs 5xx errors
- **Cache Hit Rate**: % of cached responses

---

## Security Best Practices

### ✅ Do's

1. **Use Managed Identity in production**
   ```bash
   az containerapp identity assign --name khipu-api --system-assigned
   az role assignment create --assignee <PRINCIPAL_ID> --role "Cognitive Services OpenAI User"
   ```

2. **Enable Private Endpoint**
   ```bash
   az network private-endpoint create \
     --resource-group rg-khipu-prod \
     --vnet-name khipu-vnet \
     --subnet khipu-subnet \
     --name pe-openai \
     --connection-name openai-connection \
     --private-connection-resource-id <OPENAI_RESOURCE_ID> \
     --group-id account
   ```

3. **Restrict network access**
   ```bash
   az cognitiveservices account update \
     --name khipu-openai-prod \
     --resource-group rg-khipu-prod \
     --public-network-access Disabled
   ```

### ❌ Don'ts

- ❌ Don't commit API keys to version control
- ❌ Don't use API keys in production (use Managed Identity)
- ❌ Don't disable content filtering without compliance review
- ❌ Don't expose OpenAI endpoint directly to frontend (always proxy through backend)

---

## Migration from OpenAI API

If migrating from standard OpenAI API to Azure OpenAI:

### Code Changes

```python
# Before (OpenAI API)
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

response = client.chat.completions.create(
    model="gpt-4o",  # OpenAI model name
    messages=[...]
)

# After (Azure OpenAI)
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential

credential = DefaultAzureCredential()
token = credential.get_token("https://cognitiveservices.azure.com/.default")

client = AzureOpenAI(
    azure_ad_token=token.token,
    api_version="2024-10-21",
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

response = client.chat.completions.create(
    model="gpt-4o",  # Azure deployment name (same!)
    messages=[...]
)
```

**Key Differences**:
- Change: `OpenAI` → `AzureOpenAI`
- Add: `azure_endpoint` instead of base URL
- Add: `api_version` (Azure requirement)
- Change: `api_key` → `azure_ad_token` (for Managed Identity)

### Environment Variables

```bash
# Before
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...

# After
AZURE_OPENAI_ENDPOINT=https://khipu-openai-prod.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o
# (No key needed with Managed Identity)
```

---

## Troubleshooting

### Common Issues

#### 1. "DeploymentNotFound" Error

```
Error: The API deployment for this resource does not exist.
```

**Solution**: Verify deployment name matches exactly:
```bash
az cognitiveservices account deployment list \
  --name khipu-openai-prod \
  --resource-group rg-khipu-prod
```

#### 2. "Unauthorized" Error with Managed Identity

```
Error: (Unauthorized) Access denied due to invalid subscription key or wrong API endpoint.
```

**Solution**: Check role assignment:
```bash
az role assignment list \
  --assignee <PRINCIPAL_ID> \
  --scope <OPENAI_RESOURCE_ID>
```

Ensure "Cognitive Services OpenAI User" role is assigned.

#### 3. Rate Limit Errors

```
Error: Rate limit exceeded. Please retry after X seconds.
```

**Solution**: 
- Increase deployment capacity (TPM)
- Implement exponential backoff
- Consider provisioned throughput for guaranteed capacity

---

## Cost Calculator

Use this formula to estimate monthly costs:

```python
# Example: Character detection for 100 manuscripts/month
manuscripts_per_month = 100
avg_words_per_manuscript = 50000
tokens_per_word = 1.3  # English/Spanish average

# Input tokens (manuscript text)
input_tokens_per_request = avg_words_per_manuscript * tokens_per_word  # ~65K tokens
total_input_tokens = manuscripts_per_month * input_tokens_per_request  # 6.5M tokens

# Output tokens (character list)
output_tokens_per_request = 500  # Typical character JSON
total_output_tokens = manuscripts_per_month * output_tokens_per_request  # 50K tokens

# Pricing (GPT-4o)
input_cost = (total_input_tokens / 1_000_000) * 5   # $5 per 1M input tokens
output_cost = (total_output_tokens / 1_000_000) * 15  # $15 per 1M output tokens

total_monthly_cost = input_cost + output_cost
print(f"Estimated monthly cost: ${total_monthly_cost:.2f}")
# Output: Estimated monthly cost: $33.25
```

---

## Next Steps

1. ✅ **Create Azure OpenAI Resource** (See README.md Step 1.5)
2. ✅ **Deploy Models** (gpt-4o, gpt-4o-mini)
3. ⬜ **Implement Character Service** with function calling
4. ⬜ **Set up Cost Tracking** in PostgreSQL
5. ⬜ **Configure Managed Identity** for production
6. ⬜ **Enable Private Endpoint** (optional, for security)
7. ⬜ **Set up Monitoring** with Application Insights

---

## Resources

- **Azure OpenAI Docs**: https://learn.microsoft.com/azure/ai-services/openai/
- **Pricing**: https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/
- **Managed Identity**: https://learn.microsoft.com/azure/active-directory/managed-identities-azure-resources/
- **Content Filtering**: https://learn.microsoft.com/azure/ai-services/openai/concepts/content-filter
- **Python SDK**: https://github.com/openai/openai-python

---

**Questions?** Check the main architecture docs or reach out to the team! 🚀
