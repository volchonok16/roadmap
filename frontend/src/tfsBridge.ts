export type AuthDefaults = {
  baseUrl: string
  project: string
  projectId?: string | null
  appUrl: string
  apiUrl: string
  bridgeSubmitUrl: string
  bridgeAllowedOrigins: string[]
}

function bridgePayload(submitUrl: string, defaults: AuthDefaults) {
  return {
    submitUrl,
    baseUrl: defaults.baseUrl,
    project: defaults.project,
    projectId: defaults.projectId ?? '',
    returnUrl: defaults.appUrl || window.location.origin,
  }
}

function bridgeRunner(submitUrl: string, defaults: AuthDefaults) {
  const cfg = bridgePayload(submitUrl, defaults)
  return `(async function () {
  var cfg = ${JSON.stringify(cfg)};
  var cookie = document.cookie;
  if (!cookie) {
    alert('Cookie пустой. Войдите в TFS в этой вкладке и повторите.');
    return;
  }
  var body = new URLSearchParams();
  body.set('cookie', cookie);
  body.set('base_url', cfg.baseUrl);
  body.set('project', cfg.project);
  if (cfg.projectId) body.set('project_id', cfg.projectId);
  body.set('return_url', cfg.returnUrl);
  var response = await fetch(cfg.submitUrl, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  var html = await response.text();
  document.open();
  document.write(html);
  document.close();
})();`
}

export function buildBridgeScript(submitUrl: string, defaults: AuthDefaults) {
  return bridgeRunner(submitUrl, defaults)
}

export function buildBridgeBookmarklet(submitUrl: string, defaults: AuthDefaults) {
  const script = bridgeRunner(submitUrl, defaults).replace(/\s+/g, ' ')
  return `javascript:${encodeURIComponent(script)}`
}

export function tfsWorkItemsUrl(baseUrl: string, project: string) {
  const root = baseUrl.replace(/\/$/, '')
  return `${root}/${project}/_workitems`
}
