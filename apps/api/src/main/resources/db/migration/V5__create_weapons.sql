CREATE TABLE weapons (
    id             uuid        NOT NULL DEFAULT uuidv7(),
    user_id        uuid        NOT NULL,
    payload        jsonb       NOT NULL,
    schema_version integer     NOT NULL,
    version        integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz NULL,
    CONSTRAINT pk_weapons_id PRIMARY KEY (id),
    CONSTRAINT fk_weapons_user_id FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_weapons_payload CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_weapons_schema_version CHECK (schema_version >= 1)
);

CREATE INDEX ix_weapons_user_id ON weapons (user_id, id DESC) WHERE deleted_at IS NULL;
