# Term Naming Cleanup Guide

## Overview
This document defines the consistent terminology used throughout the StyleSense codebase to avoid confusion between visual assets and their purposes.

## Core Terminology

### Primary Selfie (Avatar)
**Used for**: All visual content in the Studio, try-ons, and avatar generation
**Where stored**: Database field `avatar_selfie_url`
**Upload endpoint**: `/api/avatar/upload-selfie`
**API name**: `selfie_url`

**Examples**:
- "Upload your selfie" (UI)
- "avatar_selfie_url" (DB)
- "profile.avatar_selfie_url" (service)
- "primary avatar" (internal comments)

### Additional Selfies (Premium Feature)
**Used for**: Identity enhancement using Gemini model
**Where stored**: Database field `selfie_urls` (array)
**Premium feature**: Unlocked via subscription

**Examples**:
- "Add additional selfies" (Settings UI)
- "selfie_urls[]" (DB)
- "extra references" (internal comments)

### Body Photos
**Used for**: Body analysis, proportions, color palette
**Where stored**: Database field `full_body_url`
**Upload endpoint**: `/api/avatar/upload-full-body`

**Examples**:
- "Upload a full-body photo" (UI)
- "full_body_url" (DB)
- "body analysis" (internal logic)

### Styled Editorial Avatar
**Used for**: Studio idle hero, dashboard hero, video avatar
**Where stored**: Database fields `stylized_avatar_url`, `stylized_avatar_video_url`
**Generation**: Async background task using user's primary selfie

**Examples**:
- "Generate your avatar" (Settings)
- "stylized_avatar_url" (DB)
- "editorial avatar" (internal logic)

## Detailed Mapping

###Frontend Components

**Props & State**:
```tsx
// ✓ CORRECT
const { primarySelfieUrl, setPrimarySelfieUrl } = useSelfie();
const [primarySelfie, setPrimarySelfie] = useState(null);

// ✓ CORRECT  
<img src={primarySelfieUrl} alt="Your selfie" />

// ✓ CORRECT
<button onClick={() => uploadPrimarySelfie(file)}>

// ❌ WRONG
<img src={avatar} alt="Avatar" />  // Use "primarySelfieUrl"

// ❌ WRONG
const { avatarSelfie, setAvatarSelfie } = ...  // Use "primarySelfie"
```

**Component Names**:
```tsx
// ✓ CORRECT
<SelfieUpload />                   // Upload primary selfie
<SelfieGallery />                   // Manage additional selfies
<BodyPhotoUpload />                 // Upload body silhouette
<EditorialAvatar />                 // Styled 3D avatar

// ❌ WRONG
<AvatarUpload />   // Ambiguous - could mean editorial avatar
<PhotoUpload />    // Ambiguous - could mean any photo
```

**Service/API**:
```tsx
// ✓ CORRECT
await apiUpload("/api/avatar/upload-selfie", formData);

// ❌ WRONG
await apiUpload("/api/avatar/upload-avatar", formData);
```

### Backend Services

**Request/Response Models**:
```python
# ✓ CORRECT
class UploadSelfieRequest:
    file: UploadFile

# ✓ CORRECT  
class SelfieUploadResponse:
    selfie_url: str
    selfie_urls: List[str]  # Additional selfies

# ❌ WRONG
class AvatarUploadRequest:  # Ambiguous
    file: UploadFile

# ❌ WRONG
class PhotoUploadResponse:
    photo_url: str  # Too vague
```

**Database Columns**:
```sql
-- ✓ CORRECT
ALTER TABLE users 
  ADD COLUMN avatar_selfie_url TEXT; -- Primary selfie
  ADD COLUMN selfie_urls JSONB;       -- Additional selfies
  ADD COLUMN full_body_url TEXT;     -- Body analysis
  ADD COLUMN stylized_avatar_url TEXT;  -- Editorial avatar
  ADD COLUMN stylized_avatar_video_url TEXT; -- Editorial video

-- ❌ WRONG
ALTER TABLE users ADD COLUMN avatar_url TEXT; -- Ambiguous
```

**Service Methods**:
```python
# ✓ CORRECT
async def upload_primary_selfie(user_id: str, file: bytes) -> str:
    """Upload the user's primary selfie"""
    
async def get_additional_selfies(user_id: str) -> List[str]:
    """Get premium feature additional selfies"""

# ❌ WRONG
async def upload_avatar(user_id: str, file: bytes) -> str:  # Ambiguous
async def get_selfies(user_id: str) -> List[str]:  # Could mean any photos
```

## Usage Examples

### Studio Flow
```tsx
// ✓ CORRECT - Clear intent
if (!primarySelfieUrl) {
  return <SelfieUploadPrompt />;
}

// ✓ CORRECT - Consistent naming
<ReactCompareSliderImage 
  src={primarySelfieUrl} 
  alt="Your selfie" 
/>

// ✓ CORRECT - Descriptive
const effectiveSelfieUrl = activeSelfie || primarySelfieUrl;

// ❌ WRONG
if (!avatarUrl) return <AvatarSetup />;
```

### Settings Page
```tsx
// ✓ CORRECT
<PhotoUpload 
  onUpload={uploadPrimarySelfie}
  label="Primary Selfie" 
  accept="image/jpeg,image/png"
/>

// ✓ CORRECT - Premium feature
<SelfieSelector
  title="Additional Selfies" 
  description="Up to 3 extra selfies for identity enhancement"
  isPremium={true}
/>

// ✓ CORRECT
<BodyPhotoUpload 
  onUpload={uploadBodyPhoto}
  title="Full-body Photo for Style Analysis"
  description="Capture proportions, color palette, and form"
/>

// ✓ CORRECT
<EditorialAvatarGenerator 
  selfieUrl={primarySelfieUrl}
  status={avatarStatus}
  onRefresh={regenerateAvatar}
/>
```

## Documentation Files

**Internal README**:
- `/docs/TERMINOLOGY.md` - Core terminology definitions
- `/docs/FLOW_ANALYSIS.md` - Asset usage flow diagrams
- `/docs/CODE_CONVENTIONS.md` - Naming conventions for new code

## Implementation Priority

### Phase 1: Critical Fixes (Next Sprint)
1. **Frontend Props & State** - Rename `avatar_selfie_url` to `primarySelfieUrl`
2. **Component Names** - Update SelfieUpload, SelfieGallery, editorialAvatar
3. **Service Interactions** - Update API calls to use consistent terminology
4. **TypeScript Types** - Rename type definitions to match new terms

### Phase 2: Backend Alignment (Year Q2)
1. **Model Definitions** - Rename Pydantic models and database schemas
2. **Service Functions** - Update function names and return types
3. **API Documentation** - Update OpenAPI spec and client generators

### Phase 3: Documentation (Ongoing)
1. All `.py` files with type hints
2. All `.tsx` and `.ts` files
3. All `.py` service files
4. Database migration scripts

## Quick Reference

| Current Term | New Term | Explanation |
|--------------|----------|-------------|
| avatar | primary selfie | User's face photo used for try-ons |
| avatar | editorial avatar | Styled 3D full-body avatar |
| selfie | selfie_url | API/database field name |
| profile | avatar_selfie_url | DB field name |
| photo | primary selfie | General term should be specific |
| avatar upload | primary selfie upload | Clear what is being uploaded |

## Impact Assessment

### Breaking Changes
- **Frontend**: component props and state variable names
- **API clients**: generated TypeScript from backend
- **Internal documentation**: need updates throughout

### Non-Breaking Changes
- **Database**: field names already consistent
- **Backend logic**: interface names already correct
- **Core functionality**: no changes needed

## Migration Checklist

### Code Changes Required:
- [ ] Rename frontend TypeScript interfaces
- [ ] Update component prop names
- [ ] Fix all type imports/exports
- [ ] Update variable names in logic
- [ ] Rename function parameters

### Documentation Changes:
- [ ] Update all inline comments
- [ ] Fix docstrings
- [ ] Update README sections
- [ ] Create terminology documentation
- [ ] Update commit messages references

### Testing:
- [ ] Update integration tests
- [ ] Update UI tests
- [ ] Update API contract tests

## Benefits

1. **Clarity**: Every term has one clear meaning
2. **Maintainability**: Easier onboarding and debugging
3. **Consistency**: Predictable patterns across codebase
4. **Documentation**: Self-documenting code through naming
5. **Performance**: No technical benefits, but reduces cognitive load

## Enforcement

Use these rules in code reviews:
- Any new code must use the new terminology
- GitHub PR descriptions must list renamed files
- Search/Lint rules catch misnamed terms
- Automated pre-commit hooks check consistency

## Next Steps

1. **Run** search for inconsistent terms using `git grep`
2. **Create** list of all files to modify
3. **Prioritize** by frequency of use
4. **Implement** changes in batches
5. **Update** documentation as changes are made
6. **Verify** all tests pass
