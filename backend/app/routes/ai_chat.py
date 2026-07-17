import os
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import ChatMessage
from app.schemas import ChatRequest, ChatResponse, ChatMessageResponse

router = APIRouter(prefix="/api/chat", tags=["AI Center"])

# Initialize Cerebras
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

# System prompt for the AI assistant
SYSTEM_PROMPT = """You are EventoPro AI Assistant, a helpful and knowledgeable event management consultant. 
You help clients plan and manage their events professionally. Your expertise includes:

- Wedding planning and coordination
- Corporate event management
- Birthday party arrangements
- Concert and festival logistics
- Conference organization
- Venue selection and decoration
- Vendor recommendations (catering, photography, music, etc.)
- Budget planning and optimization
- Timeline and schedule management
- Guest management tips

Be friendly, professional, and provide actionable advice. When discussing budgets, use INR (₹) as the default currency.
Keep your responses concise but helpful. If asked about specific vendors or venues, provide general guidance 
since you don't have access to a specific vendor database."""


def get_ai_response(message: str, chat_history: list) -> str:
    """Get response from Cerebras AI or fallback."""
    if client:
        try:
            # Build conversation history
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]

            for msg in chat_history[-10:]:  # Last 10 messages for context
                role = "user" if msg.role == "user" else "assistant"
                messages.append({"role": role, "content": msg.content})

            messages.append({"role": "user", "content": message})

            response = client.chat.completions.create(
                model="gpt-oss-120b",
                messages=messages,
            )
            return response.choices[0].message.content
        except Exception as e:
            # Log the real error server-side; return a generic message to the client.
            print(f"[AI ERROR] Cerebras chat failed: {e}")
            return "I apologize, but I'm experiencing a temporary issue. Please try again in a moment."
    else:
        # Intelligent fallback responses when no API key
        return get_fallback_response(message)


def get_fallback_response(message: str) -> str:
    """Provide intelligent fallback responses without AI API."""
    message_lower = message.lower()

    if any(w in message_lower for w in ["wedding", "marriage"]):
        return """🎊 **Wedding Planning Tips:**

Here are key aspects to consider for wedding planning:

1. **Budget**: Set a clear budget early. Typical Indian weddings range from ₹5L to ₹50L+
2. **Venue**: Book 6-12 months in advance. Consider capacity, parking, and amenities
3. **Vendors**: Book photographer, caterer, and decorator at least 3-4 months ahead
4. **Timeline**: Create a detailed day-of timeline with buffer time
5. **Guest List**: Finalize early as it affects venue, catering, and budget

Would you like detailed guidance on any specific aspect?"""

    elif any(w in message_lower for w in ["corporate", "conference", "seminar", "meeting"]):
        return """💼 **Corporate Event Planning:**

Key considerations for corporate events:

1. **Objective**: Define clear goals (networking, product launch, training)
2. **Venue**: Choose based on capacity, AV facilities, and accessibility
3. **Technology**: Ensure reliable Wi-Fi, projectors, and microphones
4. **Catering**: Plan for dietary restrictions and preferences
5. **Agenda**: Create a structured schedule with breaks

I can help you plan any specific aspect in detail!"""

    elif any(w in message_lower for w in ["birthday", "party"]):
        return """🎂 **Birthday Party Planning:**

Here's a checklist for a memorable birthday:

1. **Theme**: Choose a theme that matches the celebrant's interests
2. **Venue**: Home, restaurant, or event hall based on guest count
3. **Decorations**: Balloons, banners, themed props
4. **Food**: Cake + snacks/meals based on time of day
5. **Entertainment**: Games, music, photo booth

Budget tip: DIY decorations can save 30-40% of decoration costs!"""

    elif any(w in message_lower for w in ["budget", "cost", "price", "expensive", "cheap"]):
        return """💰 **Event Budget Planning Guide:**

Here's a general budget breakdown:

| Category | % of Budget |
|----------|------------|
| Venue | 25-30% |
| Catering | 25-35% |
| Decoration | 10-15% |
| Photography | 8-12% |
| Entertainment | 5-10% |
| Miscellaneous | 5-10% |

**Tips to save:**
- Book vendors during off-season
- Negotiate package deals
- Consider weekday events for lower venue costs

What's your approximate budget? I can help optimize it!"""

    elif any(w in message_lower for w in ["vendor", "caterer", "photographer", "decorator"]):
        return """📋 **Vendor Selection Tips:**

When choosing vendors:

1. **Research**: Check reviews, portfolios, and references
2. **Compare**: Get quotes from at least 3 vendors
3. **Contract**: Always have a written agreement
4. **Insurance**: Verify vendor insurance coverage
5. **Backup Plan**: Ensure vendors have contingency plans

**Key questions to ask:**
- What's included in the package?
- What are the cancellation policies?
- Do you have experience with similar events?
- Can you provide references?"""

    elif any(w in message_lower for w in ["hello", "hi", "hey", "help"]):
        return """👋 **Welcome to EventoPro AI Assistant!**

I'm here to help you plan and manage your events. I can assist with:

🎊 Wedding planning
💼 Corporate events
🎂 Birthday parties
🎵 Concerts & festivals
📋 Vendor selection
💰 Budget planning
📅 Timeline management

What type of event are you planning? Tell me more and I'll provide tailored guidance!"""

    else:
        return """Thank you for your question! As your EventoPro AI Assistant, I can help with:

🎯 **Event Planning**: Weddings, corporate events, birthdays, concerts
📋 **Vendor Management**: Selection, negotiation, coordination
💰 **Budget Planning**: Optimization and breakdown
📅 **Timeline**: Day-of scheduling and coordination
🎨 **Theme & Decoration**: Ideas and implementation

Could you share more details about what you're planning? 
For example: the type of event, approximate guest count, budget range, and preferred date."""


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """Send a message and get AI response."""
    # Save user message
    user_message = ChatMessage(
        session_id=request.session_id,
        role="user",
        content=request.message,
    )
    db.add(user_message)
    db.commit()

    # Get chat history for context
    history = db.query(ChatMessage).filter(
        ChatMessage.session_id == request.session_id
    ).order_by(ChatMessage.created_at).all()

    # Get AI response
    reply = get_ai_response(request.message, history)

    # Save assistant response
    assistant_message = ChatMessage(
        session_id=request.session_id,
        role="assistant",
        content=reply,
    )
    db.add(assistant_message)
    db.commit()

    return ChatResponse(reply=reply, session_id=request.session_id)


@router.get("/history/{session_id}", response_model=List[ChatMessageResponse])
def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    """Get chat history for a session."""
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at).all()
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.delete("/history/{session_id}")
def clear_chat_history(session_id: str, db: Session = Depends(get_db)):
    """Clear chat history for a session."""
    db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).delete()
    db.commit()
    return {"message": "Chat history cleared", "session_id": session_id}


@router.get("/new-session")
def create_new_session():
    """Generate a new chat session ID."""
    return {"session_id": str(uuid.uuid4())}
