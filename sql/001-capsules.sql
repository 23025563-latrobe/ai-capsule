SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Serialize schema setup so repeated or concurrent migration runs are safe.
DECLARE @lock_result int;
EXEC @lock_result = sys.sp_getapplock
    @Resource = N'ai-capsule-schema', @LockMode = 'Exclusive',
    @LockOwner = 'Transaction', @LockTimeout = 30000;
IF @lock_result < 0 THROW 50001, 'Could not acquire schema migration lock.', 1;

IF OBJECT_ID(N'dbo.capsules', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.capsules (
        id bigint IDENTITY(1,1) PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
        user_id nvarchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK (LEN(LTRIM(RTRIM(user_id))) > 0),
        project_name nvarchar(120) NOT NULL CHECK (LEN(LTRIM(RTRIM(project_name))) > 0),
        prompt_title nvarchar(200) NOT NULL CHECK (LEN(LTRIM(RTRIM(prompt_title))) > 0),
        prompt_version nvarchar(40) NOT NULL DEFAULT N'1' CHECK (LEN(LTRIM(RTRIM(prompt_version))) > 0),
        prompt_text nvarchar(max) NOT NULL CHECK (LEN(LTRIM(RTRIM(prompt_text))) > 0),
        response_summary nvarchar(max) NOT NULL DEFAULT N'',
        category nvarchar(80) NOT NULL DEFAULT N'',
        usefulness nvarchar(200) NOT NULL DEFAULT N'',
        reviewed bit NOT NULL DEFAULT 0,
        improved bit NOT NULL DEFAULT 0,
        screenshot_url nvarchar(2048) NOT NULL DEFAULT N'',
        notes nvarchar(max) NOT NULL DEFAULT N'',
        created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID(N'dbo.capsules') AND name = N'capsules_owner_created')
    CREATE INDEX capsules_owner_created ON dbo.capsules (user_id, created_at DESC, id DESC);

COMMIT TRANSACTION;
