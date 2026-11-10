-- Keep schema-v1 themes compatible while adding a distinct subtitle colour for exact legacy rendering.
CREATE OR REPLACE FUNCTION public.misma_valid_widget_theme(p_theme jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_typeof(p_theme) = 'object'
    AND COALESCE(p_theme->>'schemaVersion', '1') = '1'
    AND COALESCE(p_theme->>'fontFamily', 'system-ui') IN (
      'system-ui', 'Inter', 'Roboto', 'Poppins', 'Open Sans', 'Lato', 'Montserrat', 'Nunito', 'serif', 'monospace'
    )
    AND COALESCE(p_theme->>'matchChatBackground', 'false') IN ('true', 'false')
    AND (SELECT count(*) = 11 FROM jsonb_object_keys(p_theme) AS item(key)
      WHERE key IN ('headerBackground','headerText','chatBackground','textColor','botBubbleBackground','botBubbleText','userBubbleBackground','userBubbleText','sendButtonBackground','headerButtonBackground','footerBackground'))
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(p_theme) AS item(key,value)
      WHERE key IN ('headerBackground','headerText','headerSubtitleText','chatBackground','textColor','botBubbleBackground','botBubbleText','userBubbleBackground','userBubbleText','sendButtonBackground','headerButtonBackground','footerBackground')
        AND value !~ '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$'
    )
    AND (NOT (p_theme ? 'headerSubtitleText') OR (p_theme->>'headerSubtitleText') ~ '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_theme) AS item(key)
      WHERE key NOT IN ('schemaVersion','fontFamily','matchChatBackground','headerBackground','headerText','headerSubtitleText','chatBackground','textColor','botBubbleBackground','botBubbleText','userBubbleBackground','userBubbleText','sendButtonBackground','headerButtonBackground','footerBackground')
    )
$function$;
COMMENT ON FUNCTION public.misma_valid_widget_theme(jsonb) IS 'Validates schema-v1 widget themes, hex colours and the approved font whitelist.';
