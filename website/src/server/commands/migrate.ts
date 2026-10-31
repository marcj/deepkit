import { Database } from "@deepkit/orm";
import { sql } from "@deepkit/sql";

export async function migrate(database: Database) {

    // try {
    //     await database.raw(sql`CREATE EXTENSION vector`).execute();
    //     console.log("vector engine created");
    // } catch (e) {
    //     console.log(`vector engined loaded already: ${e}`)
    // }

    await database.migrate();

    // community questions were removed
    await database.raw(sql`
DROP TABLE IF EXISTS community_message_vote;
DROP TABLE IF EXISTS community_message;
DROP FUNCTION IF EXISTS update_community_message_vectors();
`).execute();

    await database.raw(sql`
CREATE OR REPLACE FUNCTION update_doc_content_vectors()
RETURNS TRIGGER AS $$
BEGIN
    NEW.path_tsvector := to_tsvector('english', NEW.path);
    NEW.content_tsvector := to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`).execute();

    await database.raw(sql`
DROP TRIGGER IF EXISTS call_update_doc_content_vectors ON doc_page_content;
CREATE TRIGGER call_update_doc_content_vectors
BEFORE INSERT OR UPDATE ON doc_page_content
FOR EACH ROW
EXECUTE FUNCTION update_doc_content_vectors();
`).execute();

    await database.raw(sql`
CREATE INDEX IF NOT EXISTS idx_doc_page_content_path_tsvector ON doc_page_content USING GIN (path_tsvector);
CREATE INDEX IF NOT EXISTS idx_doc_page_content_content_tsvector ON doc_page_content USING GIN (content_tsvector);
`).execute();
}
