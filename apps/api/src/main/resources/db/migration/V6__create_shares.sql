CREATE TABLE shares (
    id             uuid        NOT NULL DEFAULT uuidv7(),
    short_id       text        NOT NULL,
    user_id        uuid        NOT NULL,
    build_id       uuid        NOT NULL,
    name           text        NOT NULL,
    master_version text        NOT NULL,
    payload        jsonb       NOT NULL,
    schema_version integer     NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz NULL,
    CONSTRAINT pk_shares_id PRIMARY KEY (id),
    CONSTRAINT ck_shares_short_id CHECK (short_id ~ '^[0-9A-Za-z]{12}$'),
    CONSTRAINT uq_shares_short_id UNIQUE (short_id),
    CONSTRAINT fk_shares_user_id FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_shares_build_id FOREIGN KEY (build_id) REFERENCES builds (id),
    CONSTRAINT ck_shares_name CHECK (char_length(name) BETWEEN 1 AND 50),
    CONSTRAINT ck_shares_master_version CHECK (master_version <> ''),
    CONSTRAINT ck_shares_payload CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_shares_schema_version CHECK (schema_version >= 1)
);

CREATE UNIQUE INDEX uq_shares_build_id ON shares (build_id) WHERE deleted_at IS NULL;

CREATE INDEX ix_shares_user_id ON shares (user_id, id DESC) WHERE deleted_at IS NULL;
