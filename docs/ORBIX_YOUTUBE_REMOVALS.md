# Orbix Network: YouTube Removing Videos Right After Upload

When an upload **succeeds in our system** (we get a `videoId` and URL back from the YouTube API) but the video is **removed by YouTube shortly after**, the removal is done by **YouTube**, not by our app. We do not call any API to delete or unlist videos after upload.

## What to check first

1. **YouTube Studio**
   - Go to [YouTube Studio](https://studio.youtube.com) → **Content** (and **Videos**).
   - Check for the video: it may appear as **Removed** or with a **Policy / Copyright** notice.
   - Open the video and read the **exact reason** (e.g. “Copyright”, “Community Guidelines”, “Reused content”, “Spam/misleading”).

2. **Email**
   - YouTube often sends an email to the channel owner when a video is removed or restricted. Check the inbox for the account connected to the channel.

3. **Channel status**
   - New or unverified channels can be reviewed more strictly.
   - Channel-level restrictions (strikes, age restrictions) can cause immediate takedowns.

## Common reasons YouTube removes videos quickly

- **Copyright / Content ID**  
  Music, sound effects, or visuals in the video that match a rights holder’s reference. Even short clips or background music can trigger this.

- **Reused / Low‑effort content**  
  Automated policy for content that looks largely reused (e.g. repackaged news clips, minimal original commentary). Our category is “News & Politics” (24), which can get extra scrutiny.

- **Community Guidelines**  
  Automated systems may flag content that appears to violate policies (e.g. harmful, misleading, spam-like).

- **Metadata (title / description / tags)**  
  Titles or descriptions that look like clickbait, spam, or misleading can trigger filters. Our app sends the title and description from the pipeline; avoid all-caps, excessive punctuation, or link-heavy text.

- **Shorts vs regular video**  
  We upload as a **regular video** with category **24 (News & Politics)**. If the clip is short/vertical, consider adding **#Shorts** in the description so YouTube treats it as a Short; this doesn’t stop removals but can affect how it’s classified.

## What we do in the app

- We set **visibility** from your Orbix setting: **Public**, **Unlisted**, or **Private** (Settings → Publishing → YouTube visibility).
- We send **title**, **description**, and **tags** (from the pipeline) and **categoryId: 24** (News & Politics).
- We set **selfDeclaredMadeForKids: false**.
- We **do not** delete, unlist, or change the video after a successful upload.

## Recommendations

1. **Check YouTube Studio** for the specific removal reason and fix the cause (e.g. remove copyrighted audio, adjust metadata, add more original commentary).
2. **Try uploading as Unlisted** first (Orbix Settings → YouTube visibility → Unlisted). If the video stays when unlisted, the issue may be policy/automation on **public** content; you can then make it public from Studio after checking for any warnings.
3. **Review metadata**: avoid spam-like or misleading titles/descriptions; keep titles and descriptions accurate and professional.
4. **Audio**: ensure background music and any clips are licensed or royalty-free to avoid Content ID takedowns.
5. **Server logs**: we log the **title**, **description length**, **tags**, and **visibility** for each upload so you can correlate with removals (search logs for `[YouTube Publisher]` and `YT_PUBLISH`).

If you have the exact message from YouTube (from Studio or email), use that as the source of truth for why the video was removed.
