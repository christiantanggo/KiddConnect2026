# Supabase storage buckets — production snapshot

Captured from live project (SQL section 8 / `storage.buckets`). Use when splitting KiddConnect vs Tavari or recreating a new Supabase project.

## KiddConnect / YouTube studio vertical

| Bucket | Public | Size limit | MIME types |
|--------|--------|------------|------------|
| `dadjoke-studio-assets` | yes | 50 MB | jpeg, png, webp, mpeg, mp3, wav, x-wav, mp4, aac |
| `dadjoke-studio-renders` | yes | 500 MB | video/mp4 |
| `kidquiz-photos` | yes | 10 MB | jpeg, png, webp |
| `kidquiz-videos` | yes | 500 MB | video/mp4 |
| `movie-review-images` | yes | 10 MB | jpeg, jpg, png, webp, gif |
| `movie-review-music` | yes | 50 MB | mpeg, mp4, ogg, wav, x-m4a, webm |
| `movie-review-renders` | yes | 500 MB | video/mp4 |
| `movie-review-voices` | yes | 50 MB | webm, mp4, mpeg, ogg, wav, x-m4a |
| `orbix-network-backgrounds` | yes | *(null)* | *(null — any)* |
| `orbix-network-music` | yes | *(null)* | *(null)* |
| `orbix-network-videos` | yes | *(null)* | *(null)* |

## Likely Tavari / general site (not studio-core)

| Bucket | Notes |
|--------|--------|
| `website-hero` | Marketing / CMS hero images — keep on Tavari if you split products |

## Raw JSON (reference)

```json
[
  {"id":"dadjoke-studio-assets","name":"dadjoke-studio-assets","public":true,"file_size_limit":52428800,"allowed_mime_types":["image/jpeg","image/png","image/webp","audio/mpeg","audio/mp3","audio/wav","audio/x-wav","audio/mp4","audio/aac"]},
  {"id":"dadjoke-studio-renders","name":"dadjoke-studio-renders","public":true,"file_size_limit":524288000,"allowed_mime_types":["video/mp4"]},
  {"id":"kidquiz-photos","name":"kidquiz-photos","public":true,"file_size_limit":10485760,"allowed_mime_types":["image/jpeg","image/png","image/webp"]},
  {"id":"kidquiz-videos","name":"kidquiz-videos","public":true,"file_size_limit":524288000,"allowed_mime_types":["video/mp4"]},
  {"id":"movie-review-images","name":"movie-review-images","public":true,"file_size_limit":10485760,"allowed_mime_types":["image/jpeg","image/jpg","image/png","image/webp","image/gif"]},
  {"id":"movie-review-music","name":"movie-review-music","public":true,"file_size_limit":52428800,"allowed_mime_types":["audio/mpeg","audio/mp4","audio/ogg","audio/wav","audio/x-m4a","audio/webm"]},
  {"id":"movie-review-renders","name":"movie-review-renders","public":true,"file_size_limit":524288000,"allowed_mime_types":["video/mp4"]},
  {"id":"movie-review-voices","name":"movie-review-voices","public":true,"file_size_limit":52428800,"allowed_mime_types":["audio/webm","audio/mp4","audio/mpeg","audio/ogg","audio/wav","audio/x-m4a"]},
  {"id":"orbix-network-backgrounds","name":"orbix-network-backgrounds","public":true,"file_size_limit":null,"allowed_mime_types":null},
  {"id":"orbix-network-music","name":"orbix-network-music","public":true,"file_size_limit":null,"allowed_mime_types":null},
  {"id":"orbix-network-videos","name":"orbix-network-videos","public":true,"file_size_limit":null,"allowed_mime_types":null},
  {"id":"website-hero","name":"website-hero","public":true,"file_size_limit":5242880,"allowed_mime_types":["image/jpeg","image/png","image/gif","image/webp"]}
]
```

Recreate buckets in a new project via **Dashboard → Storage** or SQL `insert into storage.buckets (...)` plus RLS policies (see repo migrations under `add_*_storage*` / `*_bucket*`).
