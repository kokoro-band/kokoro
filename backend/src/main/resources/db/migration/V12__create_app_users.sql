-- Accounts created through the demo sign-up. Passwords are bcrypt hashes. Unused outside the demo profile.
CREATE TABLE app_users (
    username VARCHAR(32) PRIMARY KEY,
    password_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
