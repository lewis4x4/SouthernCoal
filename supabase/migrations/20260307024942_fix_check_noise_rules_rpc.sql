
-- P0 FIX: check_noise_rules RPC matches actual data patterns
-- Rule types in data: sender_domain, sender_email, subject_pattern, header_pattern, body_pattern, combo
-- sender_email rules use LIKE wildcards (e.g., '%skymiles%')
-- Actions: auto_archive, auto_archive_and_read, auto_read, auto_delete_mark, block

CREATE OR REPLACE FUNCTION check_noise_rules(p_email_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_sender TEXT;
    v_subject TEXT;
    v_body TEXT;
    v_account_id UUID;
    v_rule RECORD;
BEGIN
    SELECT sender_email, subject, body_preview, account_id
    INTO v_sender, v_subject, v_body, v_account_id
    FROM emails
    WHERE id = p_email_id;

    IF v_sender IS NULL THEN
        RETURN json_build_object('matched', false);
    END IF;

    SELECT id, rule_name, rule_type, action
    INTO v_rule
    FROM email_noise_rules
    WHERE enabled = true
      AND (account_id = v_account_id OR account_id IS NULL)
      AND (
        (rule_type = 'sender_email' AND lower(v_sender) LIKE lower(match_value))
        OR (rule_type = 'sender_domain' AND lower(v_sender) LIKE '%@' || lower(match_value))
        OR (rule_type = 'subject_pattern' AND lower(COALESCE(v_subject, '')) LIKE lower(match_value))
        OR (rule_type = 'body_pattern' AND lower(COALESCE(v_body, '')) LIKE lower(match_value))
      )
    ORDER BY
        CASE rule_type
            WHEN 'sender_email' THEN 1
            WHEN 'sender_domain' THEN 2
            WHEN 'subject_pattern' THEN 3
            WHEN 'body_pattern' THEN 4
        END
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN json_build_object('matched', false);
    END IF;

    UPDATE email_noise_rules
    SET hits = COALESCE(hits, 0) + 1,
        last_hit_at = now()
    WHERE id = v_rule.id;

    RETURN json_build_object(
        'matched', true,
        'rule_name', v_rule.rule_name,
        'rule_id', v_rule.id,
        'action', v_rule.action
    );
END;
$$;
;
