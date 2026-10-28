CREATE TABLE builds (
    id             uuid        NOT NULL DEFAULT uuidv7(),
    user_id        uuid        NOT NULL,
    name           text        NOT NULL,
    master_version text        NOT NULL,
    payload        jsonb       NOT NULL,
    schema_version integer     NOT NULL,
    version        integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz NULL,
    CONSTRAINT pk_builds_id PRIMARY KEY (id),
    CONSTRAINT fk_builds_user_id FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_builds_name CHECK (char_length(name) BETWEEN 1 AND 50),
    CONSTRAINT ck_builds_master_version CHECK (master_version <> ''),
    CONSTRAINT ck_builds_payload CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_builds_schema_version CHECK (schema_version >= 1)
);

CREATE INDEX ix_builds_user_id ON builds (user_id, id DESC) WHERE deleted_at IS NULL;
