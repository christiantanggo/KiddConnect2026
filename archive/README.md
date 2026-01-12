# Archive - Legacy Implementation

This directory contains the preserved custom OpenAI Realtime + Telnyx Media Streaming implementation that was built before migrating to VAPI.

## What Was Archived

### Core Implementation Files

- `server.js` - Main server entry point with OpenAI Realtime WebSocket and Telnyx Media Streaming WebSocket integration
- `services/aiRealtime.js` - OpenAI Realtime API service for bidirectional audio streaming
- `services/callHandler.js` - Call handling logic and session management
- `routes/callAudio.js` - WebSocket audio streaming route handler
- `services/telnyx.js` - Telnyx Media Streaming API integration
- `services/mediaStreamSession.js` - Media stream session management
- `services/voximplant.js` - Voximplant integration (if not needed for VAPI)
- `services/aiProcessor.js` - AI processing logic
- `services/businessLogic.js` - Business logic (review if reusable)
- `routes/mediaStream.js` - Media streaming routes (if exists)
- `routes/phoneNumbers.js` - Phone number management routes (if not needed for VAPI)
- `routes/telnyxPhoneNumbers.js` - Telnyx phone number routes (if not needed for VAPI)
- `utils/audioConverter.js` - Audio format conversion utilities

### Lambda Functions

- `ai-processor/` - Lambda function for AI processing
- `call-handler/` - Lambda function for call handling

### Documentation

- `docs/` - All architecture and setup documentation for the legacy implementation

## How the Legacy Implementation Worked

### Architecture

1. **OpenAI Realtime API**: Used for real-time AI voice responses
   - Bidirectional audio streaming via WebSocket
   - Voice Activity Detection (VAD) for turn-taking
   - Text-to-speech (TTS) for AI responses
   - Audio format: g711_ulaw

2. **Telnyx Media Streaming**: Used for call audio handling
   - Bidirectional audio streaming with callers
   - WebSocket connection for audio data
   - Media stream session management

3. **Call Flow**:
   - Call initiated → Telnyx webhook received
   - Answer call via Telnyx API
   - Start media streaming
   - Connect Telnyx WebSocket to OpenAI Realtime WebSocket
   - Audio flows bidirectionally: Caller ↔ Telnyx ↔ Tavari Server ↔ OpenAI
   - AI processes audio and responds in real-time
   - Transcript and summary captured

### Key Features

- Custom turn-taking logic (VAPI-style with semantic VAD)
- Language detection and enforcement (English-only)
- Response validation and filtering
- TTS feedback loop prevention
- State management for conversation flow

### Dependencies

- `openai` - OpenAI SDK for Realtime API
- `ws` - WebSocket server
- `axios` - HTTP client for Telnyx API
- Custom audio conversion utilities

## How to Restore/Continue Development

### Prerequisites

1. Environment variables:
   - `OPENAI_API_KEY` - OpenAI API key
   - `TELNYX_API_KEY` - Telnyx API key
   - `RAILWAY_PUBLIC_DOMAIN` - Public domain for WebSocket URLs

2. Dependencies:
   ```bash
   npm install openai ws axios
   ```

### Restoration Steps

1. Copy files back to root:
   ```bash
   cp archive/legacy-implementation/server.js server.js
   cp -r archive/legacy-implementation/services/* services/
   cp -r archive/legacy-implementation/routes/* routes/
   cp -r archive/legacy-implementation/utils/* utils/
   ```

2. Restore dependencies in `package.json`

3. Update environment variables

4. Review and update any database schema changes

### Current State

- **Status**: Functional but archived for VAPI migration
- **Known Issues**: 
  - Language detection issues (addressed with strict validation)
  - TTS feedback loops (addressed with `isTtsPlaying` flag)
  - Turn-taking aggressiveness (addressed with VAPI-style delays)

### Future Development

This implementation can be continued as a separate branch or project. The code is preserved here for reference and potential future use.

## Notes

- All files were archived on: 2024-12-16
- Migration reason: Move to VAPI platform for faster time-to-market and reduced complexity
- The VAPI implementation provides the same functionality with less custom code to maintain
















