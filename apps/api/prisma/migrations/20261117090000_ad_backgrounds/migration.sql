-- The owner can upload one decorative background per advertising slot (docs/DECISIONS.md
-- D23/D28). A background fills an empty rail/banner/chat layer until a creative exists.
--
-- The picture is deliberately stored as bytes in PostgreSQL rather than on a writable
-- disk path: a redeploy cannot orphan files, there is no directory to misconfigure, and
-- the API stays one moving part. The primary key is the variant enum value, so the table
-- is bounded at three rows and never grows without bound — which is why it carries no
-- retention column (schema rule 5). SVG is rejected by the same rule as chat images:
-- bytes served from our origin must never be parseable as a document (docs/SECURITY.md).
--
-- Additive only.
CREATE TYPE "AdBackgroundVariant" AS ENUM ('rail', 'banner', 'chatBackground');

CREATE TABLE "AdBackground" (
    "variant" "AdBackgroundVariant" NOT NULL,
    "mimeType" VARCHAR(64) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdBackground_pkey" PRIMARY KEY ("variant")
);

-- Rollback plan:
--   DROP TABLE "AdBackground";
--   DROP TYPE "AdBackgroundVariant";
-- This loses only the uploaded decorative pictures; users, chats, reports, bans and
-- archives are untouched. The slots simply fall back to painting nothing, as before.