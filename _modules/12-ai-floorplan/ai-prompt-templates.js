/* ai-prompt-templates.js — Floorplan recognition prompt templates
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * V3: Different floorplan types need different prompts.
 */
(function (root) {
  'use strict';

  var TEMPLATES = {
    '2d-floorplan': {
      id: '2d-floorplan',
      label: '2D 户型平面图',
      description: '标准 2D 平面图(无尺寸标注)',
      prompt: '这是一个 2D 户型平面图。请仔细识别图中所有房间、墙体长度、门窗位置。' +
              '返回严格的 JSON 格式(不要 markdown,不要解释):\n' +
              '{\n' +
              '  "rooms": [{"name": "主卧", "length_m": 4.2, "width_m": 3.5, "area_m2": 14.7, "shape": "rect"}],\n' +
              '  "walls": [{"length_m": 3.5, "type": "outer"}],\n' +
              '  "doors": [{"width_m": 0.9, "count": 1}],\n' +
              '  "windows": [{"width_m": 1.5, "count": 2}],\n' +
              '  "notes": ["南向阳台", "主卧带独卫"]\n' +
              '}\n' +
              '长度单位统一为米(m)。如果没有标注尺寸请按 1:100 标准户型估算。' +
              'shape 取值: rect(矩形)/L(L形)/irregular(不规则)/round(圆形)。' +
              'type 取值: outer(外墙)/inner(内墙)。'
    },

    '2d-floorplan-annotated': {
      id: '2d-floorplan-annotated',
      label: '2D 平面图(带尺寸标注)',
      description: '图中有毫米(mm)或厘米(cm)数字标注',
      prompt: '这是一个带尺寸标注的 2D 户型平面图。注意图中的数字标注(通常为毫米 mm)。' +
              '请按标注精确计算每个房间的长宽(单位转换为米)。' +
              '返回严格的 JSON 格式(不要 markdown,不要解释):\n' +
              '{\n' +
              '  "rooms": [{"name": "主卧", "length_m": 4.2, "width_m": 3.5, "area_m2": 14.7, "shape": "rect"}],\n' +
              '  "walls": [{"length_m": 3.5, "type": "outer"}],\n' +
              '  "doors": [{"width_m": 0.9, "count": 1}],\n' +
              '  "windows": [{"width_m": 1.5, "count": 2}],\n' +
              '  "notes": []\n' +
              '}\n' +
              '1000mm = 1m。优先使用图中的标注尺寸,不要估算。'
    },

    'real-photo': {
      id: 'real-photo',
      label: '实景照片',
      description: '房间实景照片(非平面图)',
      prompt: '这是一张房间的实景照片(非平面图)。请识别房间类型、家具布局和估算房间尺寸。' +
              '返回严格的 JSON 格式(不要 markdown,不要解释):\n' +
              '{\n' +
              '  "rooms": [{"name": "客厅", "length_m": 5.0, "width_m": 4.0, "area_m2": 20.0, "shape": "rect"}],\n' +
              '  "walls": [{"length_m": 5.0, "type": "outer"}],\n' +
              '  "doors": [{"width_m": 0.9, "count": 1}],\n' +
              '  "windows": [{"width_m": 1.8, "count": 1}],\n' +
              '  "notes": ["朝南", "落地窗", "实木复合地板"]\n' +
              '}\n' +
              '根据家具(沙发/床/餐桌)比例估算房间尺寸。' +
              'shape 取值: rect/L/irregular。'
    },

    'hand-drawn': {
      id: 'hand-drawn',
      label: '手绘草图',
      description: '业主手绘户型草图',
      prompt: '这是一张业主手绘的户型草图。线条可能不规整,但请尽量识别房间布局。' +
              '返回严格的 JSON 格式(不要 markdown,不要解释):\n' +
              '{\n' +
              '  "rooms": [{"name": "主卧", "length_m": 4.0, "width_m": 3.5, "area_m2": 14.0, "shape": "rect"}],\n' +
              '  "walls": [{"length_m": 3.5, "type": "outer"}],\n' +
              '  "doors": [{"width_m": 0.9, "count": 1}],\n' +
              '  "windows": [{"width_m": 1.5, "count": 1}],\n' +
              '  "notes": ["手绘草图", "尺寸为估算"]\n' +
              '}\n' +
              '手绘图通常没有精确尺寸,按标准户型估算即可。' +
              '在 notes 中标注 "手绘草图,尺寸为估算"。'
    },

    '3d-render': {
      id: '3d-render',
      label: '3D 渲染图',
      description: '3D 立体户型渲染图',
      prompt: '这是一张 3D 立体渲染图。请识别图中所有房间、墙长、门窗位置。' +
              '返回严格的 JSON 格式(不要 markdown,不要解释):\n' +
              '{\n' +
              '  "rooms": [{"name": "客厅", "length_m": 5.0, "width_m": 4.0, "area_m2": 20.0, "shape": "rect"}],\n' +
              '  "walls": [{"length_m": 5.0, "type": "outer"}],\n' +
              '  "doors": [{"width_m": 0.9, "count": 1}],\n' +
              '  "windows": [{"width_m": 1.8, "count": 1}],\n' +
              '  "notes": ["3D 渲染"]\n' +
              '}\n' +
              '长度单位为米(m)。根据房间内的家具比例估算尺寸。'
    },

    'blueprint': {
      id: 'blueprint',
      label: '建筑蓝图',
      description: '专业建筑施工蓝图',
      prompt: '这是一张专业建筑施工蓝图。请精确识别图中所有房间、墙长、门窗位置和材质标注。' +
              '返回严格的 JSON 格式(不要 markdown,不要解释):\n' +
              '{\n' +
              '  "rooms": [{"name": "主卧", "length_m": 4.2, "width_m": 3.5, "area_m2": 14.7, "shape": "rect"}],\n' +
              '  "walls": [{"length_m": 3.5, "type": "outer"}],\n' +
              '  "doors": [{"width_m": 0.9, "count": 1}],\n' +
              '  "windows": [{"width_m": 1.5, "count": 2}],\n' +
              '  "notes": ["承重墙", "240mm 厚", "南北通透"]\n' +
              '}\n' +
              '注意图例和标注,精确使用毫米单位。'
    }
  };

  // Common system message for all templates
  var SYSTEM_MESSAGE = '你是一个专业的户型图识别助手,擅长从各种类型的建筑图纸中提取房间、墙体、门窗信息。' +
                       '你只返回严格的 JSON 格式数据,绝不返回 markdown 代码块或任何额外文字。' +
                       'JSON 字段固定为: rooms (数组), walls (数组), doors (数组), windows (数组), notes (字符串数组)。' +
                       '长度单位统一为米(m)。如果没有特殊说明,默认估算精度为 10%。';

  function getTemplate(id) {
    return TEMPLATES[id] || TEMPLATES['2d-floorplan'];
  }

  function listTemplates() {
    var list = [];
    Object.keys(TEMPLATES).forEach(function (k) {
      list.push({ id: k, label: TEMPLATES[k].label, description: TEMPLATES[k].description });
    });
    return list;
  }

  function getSystemMessage() {
    return SYSTEM_MESSAGE;
  }

  function buildUserPrompt(templateId, customNote) {
    var tpl = getTemplate(templateId);
    var base = tpl.prompt;
    if (customNote && typeof customNote === 'string' && customNote.trim()) {
      base += '\n\n补充要求: ' + customNote.trim();
    }
    return base;
  }

  function extractJson(text) {
    if (!text || typeof text !== 'string') return null;
    // Try direct parse
    var trimmed = text.trim();
    // Strip markdown code fences
    if (trimmed.startsWith('```')) {
      trimmed = trimmed.replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '');
    }
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      // Try to find JSON object/array in text
      var objStart = trimmed.indexOf('{');
      var arrStart = trimmed.indexOf('[');
      var start = -1;
      if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
      else if (arrStart >= 0) start = arrStart;
      if (start < 0) return null;
      // Find matching closing brace
      var depth = 0;
      var inString = false;
      var escape = false;
      var end = -1;
      for (var i = start; i < trimmed.length; i++) {
        var ch = trimmed[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end < 0) return null;
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (e2) {
        return null;
      }
    }
  }

  root.YSAIPrompts = {
    getTemplate: getTemplate,
    listTemplates: listTemplates,
    getSystemMessage: getSystemMessage,
    buildUserPrompt: buildUserPrompt,
    extractJson: extractJson,
    TEMPLATES: TEMPLATES,
    SYSTEM_MESSAGE: SYSTEM_MESSAGE
  };

})(typeof window !== 'undefined' ? window : this);