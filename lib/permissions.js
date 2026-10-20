// 装报价 v0.5.0 权限矩阵共享库
const ROLE_PERMISSIONS = {
  owner: ['*'],
  designer: ['view_projects', 'view_customers', 'create_quote', 'edit_projects', 'export_pdf'],
  sales: ['view_projects', 'view_customers', 'create_quote', 'send_share_link'],
  viewer: ['view_projects', 'view_customers', 'export_pdf']
};

function canDo(action, role) {
  if (!role || !action) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms[0] === '*' || perms.includes(action);
}

function getCurrentRole() {
  try {
    var u = JSON.parse(localStorage.getItem('yunshu-user') || '{}');
    return u.role || 'owner';
  } catch (e) {
    return 'owner';
  }
}

function guard(action) {
  if (!canDo(action, getCurrentRole())) {
    alert('权限不足:当前角色无法执行此操作');
    return false;
  }
  return true;
}

if (typeof module !== 'undefined') module.exports = { canDo, guard, getCurrentRole, ROLE_PERMISSIONS };
