/**
 * lib/permissions.js — v0.5.0 权限矩阵
 * 角色: owner(全权) | designer(编辑) | sales(销售) | viewer(只读)
 */
(function(root) {
  'use strict';

  const PERMISSION_MATRIX = {
    viewer:   ['view_projects', 'view_customers', 'export_pdf'],
    designer: ['view_projects', 'view_customers', 'create_quote', 'edit_projects', 'export_pdf'],
    sales:    ['view_projects', 'view_customers', 'create_quote', 'send_share_link'],
    owner:    ['*']
  };

  // 权限检查
  function canDo(action, role) {
    if (!role) return false;
    const perms = PERMISSION_MATRIX[role];
    if (!perms) return false;
    if (perms[0] === '*') return true;
    return perms.includes(action);
  }

  // 获取当前登录子账号
  function getCurrentSubAccount() {
    try {
      return JSON.parse(localStorage.getItem('yunshu-current-sub') || 'null');
    } catch(e) { return null; }
  }

  // 获取主账号(含 subAccounts 数组)
  function getMainAccount() {
    try {
      return JSON.parse(localStorage.getItem('yunshu-users') || 'null');
    } catch(e) { return null; }
  }

  // 切换子账号
  function switchSubAccount(subId) {
    const main = getMainAccount();
    if (!main || !main.subAccounts) return false;
    const sub = main.subAccounts.find(function(s) { return s.id === subId; });
    if (!sub) return false;
    localStorage.setItem('yunshu-current-sub', JSON.stringify(sub));
    return true;
  }

  // 登出子账号(切换回 owner)
  function logoutSubAccount() {
    localStorage.removeItem('yunshu-current-sub');
  }

  // 获取当前 effective role(含降级)
  function getCurrentRole() {
    const sub = getCurrentSubAccount();
    return sub ? sub.role : 'owner';
  }

  // 是否为 owner
  function isOwner() {
    return getCurrentRole() === 'owner';
  }

  // 权限按钮渲染辅助: 返回 disabled 属性字符串
  function btnDisabled(action) {
    return canDo(action, getCurrentRole()) ? '' : 'disabled style="opacity:0.45;pointer-events:none;"';
  }

  // 权限保护: action 不允许则弹 toast 并返回 true
  function guard(action, toastFn) {
    if (canDo(action, getCurrentRole())) return false;
    if (toastFn) toastFn('无此权限: ' + action);
    return true;
  }

  root.YUNSHU_PERMS = {
    canDo: canDo,
    getCurrentSubAccount: getCurrentSubAccount,
    getMainAccount: getMainAccount,
    switchSubAccount: switchSubAccount,
    logoutSubAccount: logoutSubAccount,
    getCurrentRole: getCurrentRole,
    isOwner: isOwner,
    btnDisabled: btnDisabled,
    guard: guard,
    PERMISSION_MATRIX: PERMISSION_MATRIX
  };

})(window);
