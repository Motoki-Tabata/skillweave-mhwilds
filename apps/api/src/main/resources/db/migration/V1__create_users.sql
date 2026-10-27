CREATE TABLE users (
    id         uuid        NOT NULL DEFAULT uuidv7(),
    discord_id text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_users_id PRIMARY KEY (id),
    CONSTRAINT uq_users_discord_id UNIQUE (discord_id),
    CONSTRAINT ck_users_discord_id CHECK (discord_id ~ '^[0-9]{1,20}$')
);
