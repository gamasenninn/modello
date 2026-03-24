// Modello Frontend
(function() {
  var state = { tables: [], screens: [], currentTable: null, currentScreen: null, currentView: 'home', user: null, navStack: [] };

  // === API ===
  function api(method, url, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r) {
      if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
      return r.json();
    });
  }

  // === Auth ===
  function checkAuth() {
    fetch('/api/auth/me').then(function(r) { return r.json(); }).then(function(data) {
      if (!data.authenticated) { window.location.href = '/login.html'; return; }
      state.user = data.user;
      showHome();
    }).catch(function() { window.location.href = '/login.html'; });
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).then(function() { window.location.href = '/login.html'; });
  }

  // === Navigation ===
  function loadNav() {
    Promise.all([
      api('GET', '/api/tables'),
      api('GET', '/api/screens')
    ]).then(function(results) {
      state.tables = results[0];
      state.screens = results[1];
      var nav = document.getElementById('nav-list');
      var html = '';
      if (state.user) {
        html += '<div style="padding:10px 16px;font-size:11px;color:#95a5a6;border-bottom:1px solid #34495e">'
          + esc(state.user.display_name || state.user.username) + ' (' + state.user.role + ')'
          + ' <a href="#" onclick="App.logout();return false" style="color:#e74c3c;margin-left:8px">Logout</a></div>';
      }
      html += '<div class="nav-item' + (state.currentView === 'home' ? ' active' : '') + '" onclick="App.showHome()">Home</div>';

      // 全テーブルを表示、ビューがある場合はツリー表示
      var tableScreens = {};
      state.screens.forEach(function(s) {
        if (!tableScreens[s.table_name]) tableScreens[s.table_name] = [];
        tableScreens[s.table_name].push(s);
      });

      if (state.tables.length > 0) {
        html += '<div style="padding:8px 16px;font-size:10px;color:#7f8c8d;text-transform:uppercase;border-top:1px solid #34495e">Tables</div>';
        state.tables.forEach(function(t) {
          var active = state.currentTable === t.name ? ' active' : '';
          var screens = tableScreens[t.name] || [];
          var hasViews = screens.length > 0;

          // テーブル行
          html += '<div class="nav-item' + active + '" style="display:flex;align-items:center" onclick="App.openTable(\'' + t.name + '\')">'
            + '<span style="flex:1">' + esc(t.name) + ' <span style="font-size:11px;color:#95a5a6">(' + t.rows + ')</span></span>';
          if (hasViews) {
            html += '<span style="font-size:9px;color:#3498db;padding:1px 5px;border:1px solid #3498db;border-radius:8px">' + screens.length + ' views</span>';
          }
          html += '</div>';

          // ビュー一覧（インデント）
          if (hasViews) {
            screens.forEach(function(s) {
              var vActive = state._currentScreenId === s.id ? ' active' : '';
              html += '<div class="nav-item' + vActive + '" style="padding-left:32px;font-size:12px;display:flex;align-items:center">'
                + '<span style="flex:1;cursor:pointer" onclick="event.stopPropagation();App.openScreen(\'' + s.id + '\')">' + esc(s.name) + '</span>';
              if (state.user && state.user.role === 'admin') {
                html += '<span style="cursor:pointer;font-size:11px;color:#95a5a6;padding:2px 4px" onclick="event.stopPropagation();App.openBuilder(\'' + s.id + '\')" title="Edit">&#9998;</span>';
              }
              html += '</div>';
            });
          }
        });
      }

      if (state.user && state.user.role === 'admin') {
        html += '<div style="border-top:1px solid #34495e"></div>';
        html += '<div class="nav-item" onclick="App.showWizard()" style="color:#3498db">+ New App</div>';
        html += '<div class="nav-item" onclick="App.showCreateTable()" style="color:#95a5a6;font-size:12px">+ New Table</div>';
      }
      nav.innerHTML = html;
    });
  }

  // === Home ===
  function showHome() {
    state.currentTable = null;
    state.currentView = 'home';
    setTitle('Modello');
    setActions(state.user && state.user.role === 'admin' ? '<button class="btn btn-primary" onclick="App.showWizard()">+ New App</button>' : '');

    Promise.all([
      api('GET', '/api/tables'),
      api('GET', '/api/screens')
    ]).then(function(results) {
      var tables = results[0];
      var screens = results[1];
      var html = '';

      // アプリカード
      if (screens.length > 0) {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-bottom:24px">';
        screens.forEach(function(s) {
          var table = tables.find(function(t) { return t.name === s.table_name; });
          var count = table ? table.rows : 0;
          var cols = table ? table.columns : 0;
          html += '<div class="table-card" style="cursor:pointer" onclick="App.openTable(\'' + s.table_name + '\')">'
            + '<div class="info"><div class="name">' + esc(s.name) + '</div>'
            + '<div class="meta">' + esc(s.table_name) + ' - ' + count + ' records, ' + cols + ' columns</div></div></div>';
        });
        if (state.user && state.user.role === 'admin') {
          html += '<div class="table-card" style="cursor:pointer;border:2px dashed #ddd;text-align:center;color:#3498db" onclick="App.showWizard()">'
            + '<div class="info"><div class="name">+ New App</div><div class="meta">Create a new application</div></div></div>';
        }
        html += '</div>';
      } else {
        html += '<div style="text-align:center;padding:60px;color:#888">';
        html += '<h3 style="margin-bottom:12px">Welcome to Modello</h3>';
        html += '<p style="margin-bottom:20px">Get started by creating your first app.</p>';
        if (state.user && state.user.role === 'admin') {
          html += '<button class="btn btn-primary" onclick="App.showWizard()" style="font-size:16px;padding:12px 24px">+ Create Your First App</button>';
        }
        html += '</div>';
      }
      setContent(html);
    });
    loadNav();
  }

  // === App Creation Wizard ===
  function showWizard(step, forTable) {
    step = step || 1;
    if (forTable && step === 1) {
      // 既存テーブルに新しいビューを追加するモード
      state._wizardData = { appName: '', tableName: forTable, useExisting: true, addViewMode: true };
      step = 1;
    }
    state.currentView = 'wizard';
    state._wizardStep = step;
    var totalSteps = step <= 2 ? '2-3' : '3';
    setTitle('Create New App - Step ' + step + '/' + totalSteps);
    setActions('');

    if (step === 1) {
      var html = '<div class="form-container">';
      html += '<h3 style="margin-bottom:16px">Step 1: App Info</h3>';
      html += '<div class="form-group"><label class="required">App Name</label><input type="text" id="wiz-app-name" placeholder="e.g. Customer Management" value="' + esc(state._wizardData ? state._wizardData.appName : '') + '"></div>';
      html += '<div class="form-group"><label class="required">Table Name</label><input type="text" id="wiz-table-name" placeholder="e.g. customers" value="' + esc(state._wizardData ? state._wizardData.tableName : '') + '">';
      html += '<div style="font-size:11px;color:#888;margin-top:4px">Lowercase, no spaces. This is the database table name.</div></div>';
      html += '<div class="form-group"><label>Or use existing table</label><select id="wiz-existing-table"><option value="">-- Create new table --</option>';
      state.tables.forEach(function(t) {
        html += '<option value="' + t.name + '">' + t.name + ' (' + t.rows + ' rows)</option>';
      });
      html += '</select></div>';
      html += '<div class="form-actions"><button class="btn btn-primary" onclick="App.wizardNext()">Next →</button>'
        + '<button class="btn" onclick="App.showHome()">Cancel</button></div></div>';
      setContent(html);
      // Auto-fill table name from app name
      var appNameInput = document.getElementById('wiz-app-name');
      appNameInput.addEventListener('input', function() {
        var tn = document.getElementById('wiz-table-name');
        if (!state._wizardData || !state._wizardData.tableName) {
          tn.value = appNameInput.value.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
        }
      });
    } else if (step === 2) {
      var html = '<div class="form-container">';
      html += '<h3 style="margin-bottom:16px">Step 2: Define Columns</h3>';
      html += '<p style="margin-bottom:12px;color:#888;font-size:13px">App: <strong>' + esc(state._wizardData.appName) + '</strong> (table: ' + esc(state._wizardData.tableName) + ')</p>';
      if (state._wizardData.useExisting) {
        html += '<p style="color:#3498db;font-size:13px">Using existing table. Columns already defined.</p>';
      } else {
        html += '<div id="column-defs"><div class="form-group" style="display:flex;gap:8px;align-items:end">'
          + '<div style="flex:2"><label>Column Name</label><input type="text" class="col-name" value="id"></div>'
          + '<div style="flex:1"><label>Type</label><select class="col-type"><option>INTEGER</option><option>TEXT</option><option>REAL</option><option>DATE</option></select></div>'
          + '<div><label>PK</label><input type="checkbox" class="col-pk" checked></div>'
          + '<div><label>Required</label><input type="checkbox" class="col-req"></div>'
          + '</div></div>';
        html += '<button class="btn btn-sm" onclick="App.addColumnDef()" style="margin-bottom:16px">+ Add Column</button>';
      }
      html += '<div class="form-actions"><button class="btn btn-primary" onclick="App.wizardNext()">Create App →</button>'
        + '<button class="btn" onclick="App.showWizard(1)">← Back</button></div></div>';
      setContent(html);
    } else if (step === 3) {
      var candidates = state._wizardData.relationCandidates || [];
      var html = '<div class="form-container">';
      html += '<h3 style="margin-bottom:16px">Step 3: Select Relations (optional)</h3>';
      html += '<p style="margin-bottom:12px;color:#888;font-size:13px">Related tables were detected. Select which ones to include as child views:</p>';
      candidates.forEach(function(r, i) {
        html += '<div style="padding:8px 12px;border:1px solid #eee;border-radius:4px;margin-bottom:6px">'
          + '<label><input type="checkbox" class="rel-checkbox" data-index="' + i + '"> '
          + '<strong>' + esc(r.title || r.table) + '</strong>'
          + ' <span style="color:#888;font-size:12px">(' + esc(r.table) + '.' + esc(r.foreignKey) + ')</span>'
          + '</label></div>';
      });
      html += '<div class="form-actions"><button class="btn btn-primary" onclick="App.wizardNext()">Finish</button>'
        + '<button class="btn" onclick="App.wizardSkipRelations()">Skip</button></div></div>';
      setContent(html);
    }
  }

  function wizardNext() {
    if (state._wizardStep === 1) {
      var appName = document.getElementById('wiz-app-name').value.trim();
      var tableName = document.getElementById('wiz-table-name').value.trim();
      var existingTable = document.getElementById('wiz-existing-table').value;
      if (!appName) { alert('App name is required'); return; }
      if (!existingTable && !tableName) { alert('Table name is required'); return; }
      state._wizardData = {
        appName: appName,
        tableName: existingTable || tableName,
        useExisting: !!existingTable
      };
      showWizard(2);
    } else if (state._wizardStep === 2) {
      var data = state._wizardData;

      var createTable;
      if (data.useExisting) {
        createTable = Promise.resolve({ ok: true });
      } else {
        var rows = document.querySelectorAll('#column-defs .form-group');
        var columns = [];
        rows.forEach(function(row) {
          var colName = row.querySelector('.col-name').value.trim();
          if (!colName) return;
          columns.push({
            name: colName,
            type: row.querySelector('.col-type').value,
            primary: row.querySelector('.col-pk').checked,
            required: row.querySelector('.col-req').checked,
          });
        });
        if (columns.length === 0) { alert('At least one column required'); return; }
        createTable = api('POST', '/api/tables', { name: data.tableName, columns: columns });
      }

      createTable.then(function(r) {
        if (r.error) { alert('Error: ' + r.error); return; }
        return api('POST', '/api/generate-screen/' + data.tableName);
      }).then(function(r) {
        if (r && r.ok) {
          state._wizardData.screenId = r.id;
          state._wizardData.relationCandidates = r.relationCandidates || [];
          // Update screen name
          return api('PUT', '/api/screens/' + r.id, { name: data.appName }).then(function() {
            if (state._wizardData.relationCandidates.length > 0) {
              showWizard(3); // リレーション選択ステップ
            } else {
              state._wizardData = null;
              alert('App "' + data.appName + '" created!');
              loadNav();
              openTable(data.tableName);
            }
          });
        }
      });
    } else if (state._wizardStep === 3) {
      // リレーション選択を保存
      var selectedRelations = [];
      var checkboxes = document.querySelectorAll('.rel-checkbox:checked');
      checkboxes.forEach(function(cb) {
        var idx = parseInt(cb.dataset.index);
        selectedRelations.push(state._wizardData.relationCandidates[idx]);
      });
      var screenId = state._wizardData.screenId;
      api('GET', '/api/screens/' + screenId).then(function(screen) {
        var def = screen.definition;
        def.relations = selectedRelations;
        return api('PUT', '/api/screens/' + screenId, { definition: def });
      }).then(function() {
        var tableName = state._wizardData.tableName;
        state._wizardData = null;
        alert('App created!');
        loadNav();
        openTable(tableName);
      });
    }
  }

  // === Open by Screen ID ===
  function openScreen(screenId) {
    var screen = state.screens.find(function(s) { return s.id === screenId; });
    if (!screen) { showHome(); return; }
    state._currentScreenId = screenId;
    openTable(screen.table_name);
  }

  // === Inline Builder (modal) ===
  function openBuilder(screenId) {
    window.location.href = '/builder.html?screen=' + screenId;
  }

  // === Table List View ===
  function openTable(name, opts) {
    opts = opts || {};
    state.currentTable = name;
    state.currentView = 'list';
    var page = opts.page || 1;
    var sort = opts.sort || '';
    var order = opts.order || 'ASC';
    var search = opts.search || '';
    setTitle(name);

    // 画面定義があれば使う
    var screen = state.screens.find(function(s) { return s.table_name === name; });

    var qs = '?page=' + page + '&limit=50';
    if (sort) qs += '&sort=' + sort + '&order=' + order;
    if (search) qs += '&search=' + encodeURIComponent(search);

    Promise.all([
      api('GET', '/api/tables/' + name + '/schema'),
      api('GET', '/api/data/' + name + qs)
    ]).then(function(results) {
      var schema = results[0];
      var result = results[1];
      var cols = schema.columns;
      var rows = result.data;
      var pag = result.pagination;

      setActions('<button class="btn btn-primary" onclick="App.showForm(\'' + name + '\')">+ New</button>');

      var html = '<div class="search-bar"><input type="text" id="search-input" placeholder="Search..." value="' + esc(search) + '" onkeydown="if(event.key===\'Enter\')App.doSearch(\'' + name + '\')" oninput="App._searchDebounce(\'' + name + '\')"></div>';
      html += '<table class="data-table"><thead><tr>';
      cols.forEach(function(c) {
        var arrow = '';
        var nextOrder = 'ASC';
        if (sort === c.name) { arrow = order === 'ASC' ? ' ↑' : ' ↓'; nextOrder = order === 'ASC' ? 'DESC' : 'ASC'; }
        html += '<th onclick="App.openTable(\'' + name + '\',{sort:\'' + c.name + '\',order:\'' + nextOrder + '\',search:\'' + esc(search) + '\'})">'
          + esc(c.name) + '<span class="sort-arrow">' + arrow + '</span></th>';
      });
      html += '</tr></thead><tbody>';
      if (rows.length === 0) {
        html += '<tr><td colspan="' + cols.length + '" style="text-align:center;color:#888;padding:20px">No records</td></tr>';
      }
      var pk = cols.find(function(c) { return c.pk > 0; });
      var pkName = pk ? pk.name : 'rowid';
      rows.forEach(function(row) {
        html += '<tr onclick="App.showForm(\'' + name + '\',' + row[pkName] + ')">';
        cols.forEach(function(c) {
          var val = row[c.name];
          if (val === null) val = '';
          html += '<td>' + esc(String(val)).substring(0, 100) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table>';

      // Pagination
      html += '<div class="pagination">';
      html += '<span>Page ' + pag.page + ' / ' + pag.pages + ' (' + pag.total + ' records)</span>';
      if (pag.page > 1) html += '<button class="btn btn-sm" onclick="App.openTable(\'' + name + '\',{page:' + (pag.page-1) + ',sort:\'' + sort + '\',order:\'' + order + '\',search:\'' + esc(search) + '\'})">Prev</button>';
      if (pag.page < pag.pages) html += '<button class="btn btn-sm" onclick="App.openTable(\'' + name + '\',{page:' + (pag.page+1) + ',sort:\'' + sort + '\',order:\'' + order + '\',search:\'' + esc(search) + '\'})">Next</button>';
      html += '</div>';

      setContent(html);
    });
    loadNav();
  }

  // === Form View ===
  function showForm(table, id, defaults) {
    state.currentView = 'form';
    state.currentTable = table;
    defaults = defaults || {};

    // 画面定義を取得（子テーブルの場合は親のscreenIdを使わない）
    var screenPromise;
    var screenId = state._currentScreenId;
    // screenIdが設定されていても、そのスクリーンのtable_nameが現在のtableと一致しなければ使わない
    var useScreenId = false;
    if (screenId) {
      var cachedScreen = state.screens.find(function(s) { return s.id === screenId; });
      if (cachedScreen && cachedScreen.table_name === table) useScreenId = true;
    }
    if (useScreenId) {
      screenPromise = api('GET', '/api/screens/' + screenId).catch(function() { return null; });
    } else {
      screenPromise = api('GET', '/api/screens').then(function(screens) {
        var s = screens.find(function(sc) { return sc.table_name === table; });
        return s ? api('GET', '/api/screens/' + s.id) : null;
      });
    }

    Promise.all([
      api('GET', '/api/tables/' + table + '/schema'),
      screenPromise
    ]).then(function(results) {
      var schema = results[0];
      var screenData = results[1];
      var cols = schema.columns;
      var pk = cols.find(function(c) { return c.pk > 0; });
      var pkName = pk ? pk.name : 'rowid';
      var layout = screenData && screenData.definition ? screenData.definition.layout : null;
      // FKカラムを検出（外部キー情報から）
      var fkColumns = (schema.foreignKeys || []).map(function(fk) { return fk.from; });
      // システムカラム
      var systemColumns = ['created_at', 'updated_at'];

      var loadRecord = id ? api('GET', '/api/data/' + table + '/' + id) : Promise.resolve(null);
      loadRecord.then(function(record) {
        setTitle(record ? table + ' #' + id : table + ' - New');
        setActions('');

        var html = '<div class="form-container">';

        // layout がある場合はそれを使う
        if (layout && layout.length > 0) {
          layout.forEach(function(fieldDef) {
            var c = cols.find(function(col) { return col.name === fieldDef.field; });
            if (!c) return;
            if (c.pk && c.type && c.type.toUpperCase().includes('INT') && !record) return;
            var val = record ? (record[c.name] !== null ? record[c.name] : '') : (defaults[c.name] || c.dflt_value || '');
            // FKフィールドはhiddenにする（新規時のdefaults、または既存レコードのFKカラム）
            var isFKField = defaults[c.name] !== undefined || fkColumns.indexOf(c.name) >= 0;
            if (isFKField) {
              html += '<input type="hidden" name="' + c.name + '" value="' + esc(String(val)) + '">';
              return;
            }
            var type = fieldDef.type || guessFieldType(c);
            var isRequired = fieldDef.required || c.notnull;
            var requiredAttr = isRequired ? ' required' : '';
            var requiredClass = isRequired ? ' required' : '';
            var readonly = (c.pk && record) ? ' readonly' : '';
            var label = fieldDef.label || c.name;

            html += '<div class="form-group"><label class="' + requiredClass + '">' + esc(label) + '</label>';
            if (type === 'checkbox') {
              html += '<input type="checkbox" name="' + c.name + '"' + (val ? ' checked' : '') + readonly + '>';
            } else if (type === 'textarea') {
              html += '<textarea name="' + c.name + '"' + requiredAttr + readonly + '>' + esc(String(val)) + '</textarea>';
            } else if (type === 'select' && fieldDef.options) {
              html += '<select name="' + c.name + '"' + requiredAttr + readonly + '>';
              fieldDef.options.forEach(function(opt) {
                html += '<option' + (String(val) === String(opt) ? ' selected' : '') + '>' + esc(opt) + '</option>';
              });
              html += '</select>';
            } else {
              html += '<input type="' + type + '" name="' + c.name + '" value="' + esc(String(val)) + '"' + requiredAttr + readonly + '>';
            }
            html += '</div>';
          });
        } else {
          // layout なし: カラムから自動生成
          cols.forEach(function(c) {
            if (c.pk && c.type && c.type.toUpperCase().includes('INT') && !record) return;
            // システムカラム非表示
            if (systemColumns.indexOf(c.name) >= 0) return;
            var val = record ? (record[c.name] !== null ? record[c.name] : '') : (defaults[c.name] || c.dflt_value || '');
            // FKフィールドはhiddenにする
            var isFKField = defaults[c.name] !== undefined || fkColumns.indexOf(c.name) >= 0;
            if (isFKField) {
              html += '<input type="hidden" name="' + c.name + '" value="' + esc(String(val)) + '">';
              return;
            }
            var type = guessFieldType(c);
            var required = c.notnull ? ' required' : '';
            var requiredClass = c.notnull ? ' required' : '';
            var readonly = (c.pk && record) ? ' readonly' : '';

            html += '<div class="form-group"><label class="' + requiredClass + '">' + esc(c.name) + '</label>';
            if (type === 'checkbox') {
              html += '<input type="checkbox" name="' + c.name + '"' + (val ? ' checked' : '') + readonly + '>';
            } else if (type === 'textarea') {
              html += '<textarea name="' + c.name + '"' + required + readonly + '>' + esc(String(val)) + '</textarea>';
            } else {
              html += '<input type="' + type + '" name="' + c.name + '" value="' + esc(String(val)) + '"' + required + readonly + '>';
            }
            html += '</div>';
          });
        }

        html += '<div class="form-actions">';
        html += '<button class="btn btn-primary" onclick="App.saveRecord(\'' + table + '\',' + (id || 'null') + ')">Save</button>';
        html += '<button class="btn" onclick="App.navBack()">Back</button>';
        if (id) html += '<button class="btn btn-danger" onclick="App.deleteRecord(\'' + table + '\',' + id + ')">Delete</button>';
        html += '</div></div>';

        // JS Customization: onLoad + onChange
        setTimeout(function() {
          var scr = state.screens.find(function(s) { return s.table_name === table; });
          if (scr) {
            api('GET', '/api/screens/' + scr.id).then(function(scrData) {
              var scripts = scrData.definition.scripts;
              if (!scripts) return;
              state._currentScripts = scripts;
              if (scripts.onLoad) execScript(scripts.onLoad, { record: record });
              // onChange listeners
              if (scripts.onChange) {
                var inputs = document.querySelectorAll('.form-container input, .form-container select, .form-container textarea');
                inputs.forEach(function(el) {
                  el.addEventListener('change', function() {
                    var formData = getFormData();
                    execScript(scripts.onChange, { field: el.name, value: el.value, record: formData });
                  });
                });
              }
            });
          }
        }, 100);

        // Relations
        if (id && screenData && screenData.definition) {
          (function() {
              var def = screenData.definition;
              if (def.relations && def.relations.length > 0) {
                var relHtml = '<div class="relations-section">';
                var promises = def.relations.map(function(rel) {
                  return api('GET', '/api/data/' + rel.table + '?filter_' + rel.foreignKey + '=' + id);
                });
                Promise.all(promises).then(function(results) {
                  def.relations.forEach(function(rel, i) {
                    var childRows = results[i].data;
                    relHtml += '<div class="relation-panel"><h3>' + esc(rel.title || rel.table) + ' (' + childRows.length + ')'
                      + ' <button class="btn btn-sm btn-primary" onclick="App.openChildForm(\'' + rel.table + '\',null,\'' + table + '\',' + id + ',{' + rel.foreignKey + ':' + id + '})">+ Add</button></h3>';
                    if (childRows.length > 0) {
                      var childCols = Object.keys(childRows[0]);
                      relHtml += '<table class="data-table"><thead><tr>';
                      childCols.forEach(function(cc) { relHtml += '<th>' + esc(cc) + '</th>'; });
                      relHtml += '</tr></thead><tbody>';
                      childRows.forEach(function(cr) {
                        var childPk = cr.id || cr[Object.keys(cr)[0]];
                        relHtml += '<tr onclick="App.openChildForm(\'' + rel.table + '\',' + childPk + ',\'' + table + '\',' + id + ')">';
                        childCols.forEach(function(cc) { relHtml += '<td>' + esc(String(cr[cc] || '')) + '</td>'; });
                        relHtml += '</tr>';
                      });
                      relHtml += '</tbody></table>';
                    } else {
                      relHtml += '<div style="color:#888;font-size:13px">No records</div>';
                    }
                    relHtml += '</div>';
                  });
                  relHtml += '</div>';
                  document.getElementById('content').innerHTML += relHtml;
                });
              }
          })();
        }

        setContent(html);
      });
    });
  }

  function getFormData() {
    var form = document.querySelector('.form-container');
    if (!form) return {};
    var inputs = form.querySelectorAll('input, select, textarea');
    var data = {};
    inputs.forEach(function(el) {
      if (el.type === 'checkbox') data[el.name] = el.checked ? 1 : 0;
      else data[el.name] = el.value;
    });
    return data;
  }

  function saveRecord(table, id) {
    var data = getFormData();

    // onSave hook
    if (state._currentScripts && state._currentScripts.onSave) {
      var result = execScript(state._currentScripts.onSave, { record: data });
      if (result && result.error) { alert(result.error); return; }
    }

    var method = id ? 'PUT' : 'POST';
    var url = '/api/data/' + table + (id ? '/' + id : '');
    api(method, url, data).then(function(r) {
      if (r.error) { alert('Error: ' + r.error); return; }
      var newId = id || r.id;
      showForm(table, newId);
    });
  }

  function deleteRecord(table, id) {
    // onDelete hook
    if (state._currentScripts && state._currentScripts.onDelete) {
      var result = execScript(state._currentScripts.onDelete, { id: id });
      if (result === false) return;
    }
    if (!confirm('Delete this record?')) return;
    api('DELETE', '/api/data/' + table + '/' + id).then(function() { openTable(table); });
  }

  // === Create Table ===
  function showCreateTable() {
    state.currentView = 'create-table';
    setTitle('Create New Table');
    setActions('');
    var html = '<div class="form-container">';
    html += '<div class="form-group"><label>Table Name</label><input type="text" id="new-table-name" placeholder="e.g. customers"></div>';
    html += '<div id="column-defs"><div class="form-group" style="display:flex;gap:8px;align-items:end">'
      + '<div style="flex:2"><label>Column Name</label><input type="text" class="col-name" value="id"></div>'
      + '<div style="flex:1"><label>Type</label><select class="col-type"><option>INTEGER</option><option>TEXT</option><option>REAL</option><option>DATE</option></select></div>'
      + '<div><label>PK</label><input type="checkbox" class="col-pk" checked></div>'
      + '<div><label>Required</label><input type="checkbox" class="col-req"></div>'
      + '</div></div>';
    html += '<button class="btn btn-sm" onclick="App.addColumnDef()" style="margin-bottom:16px">+ Add Column</button>';
    html += '<div class="form-actions"><button class="btn btn-primary" onclick="App.doCreateTable()">Create Table</button>'
      + '<button class="btn" onclick="App.showHome()">Cancel</button></div></div>';
    setContent(html);
  }

  function addColumnDef() {
    var container = document.getElementById('column-defs');
    var div = document.createElement('div');
    div.className = 'form-group';
    div.style = 'display:flex;gap:8px;align-items:end';
    div.innerHTML = '<div style="flex:2"><input type="text" class="col-name" placeholder="column name"></div>'
      + '<div style="flex:1"><select class="col-type"><option>TEXT</option><option>INTEGER</option><option>REAL</option><option>DATE</option></select></div>'
      + '<div><input type="checkbox" class="col-pk"></div>'
      + '<div><input type="checkbox" class="col-req"></div>'
      + '<div><button class="btn btn-sm btn-danger" onclick="this.parentElement.parentElement.remove()">x</button></div>';
    container.appendChild(div);
  }

  function doCreateTable() {
    var name = document.getElementById('new-table-name').value.trim();
    if (!name) { alert('Table name is required'); return; }
    var rows = document.querySelectorAll('#column-defs .form-group');
    var columns = [];
    rows.forEach(function(row) {
      var colName = row.querySelector('.col-name').value.trim();
      if (!colName) return;
      columns.push({
        name: colName,
        type: row.querySelector('.col-type').value,
        primary: row.querySelector('.col-pk').checked,
        required: row.querySelector('.col-req').checked,
      });
    });
    if (columns.length === 0) { alert('At least one column required'); return; }
    api('POST', '/api/tables', { name: name, columns: columns }).then(function(r) {
      if (r.error) { alert('Error: ' + r.error); return; }
      openTable(name);
    });
  }

  function deleteTable(name) {
    if (!confirm('Delete table "' + name + '"? This cannot be undone.')) return;
    api('DELETE', '/api/tables/' + name).then(function() { showHome(); });
  }

  function doSearch(table) {
    var val = document.getElementById('search-input').value;
    openTable(table, { search: val });
  }

  // === Helpers ===
  function setTitle(t) { document.getElementById('page-title').textContent = t; }
  function setActions(h) { document.getElementById('header-actions').innerHTML = h; }
  function setContent(h) { document.getElementById('content').innerHTML = h; }
  function esc(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // === JS Customization: Script Execution ===
  function execScript(code, context) {
    try {
      var helpers = {
        show: function(field) {
          var el = document.querySelector('.form-group [name="' + field + '"]');
          if (el) el.closest('.form-group').style.display = '';
        },
        hide: function(field) {
          var el = document.querySelector('.form-group [name="' + field + '"]');
          if (el) el.closest('.form-group').style.display = 'none';
        },
        setRequired: function(field, required) {
          var el = document.querySelector('.form-group [name="' + field + '"]');
          if (el) { el.required = required; var label = el.closest('.form-group').querySelector('label'); if (label) label.className = required ? 'required' : ''; }
        },
        setValue: function(field, value) {
          var el = document.querySelector('.form-group [name="' + field + '"]');
          if (el) { if (el.type === 'checkbox') el.checked = !!value; else el.value = value; }
        },
        getValue: function(field) {
          var el = document.querySelector('.form-group [name="' + field + '"]');
          if (!el) return null;
          if (el.type === 'checkbox') return el.checked ? 1 : 0;
          return el.value;
        },
        alert: function(msg) { window.alert(msg); },
      };
      var fn = new Function('show', 'hide', 'setRequired', 'setValue', 'getValue', 'alert', 'field', 'value', 'record', 'id', code);
      return fn(helpers.show, helpers.hide, helpers.setRequired, helpers.setValue, helpers.getValue, helpers.alert,
        context.field, context.value, context.record, context.id);
    } catch (e) {
      console.error('Script error:', e);
    }
  }

  function guessFieldType(col) {
    var t = (col.type || 'TEXT').toUpperCase();
    if (t.includes('INT')) return 'number';
    if (t.includes('REAL') || t.includes('FLOAT')) return 'number';
    if (t.includes('DATE')) return 'date';
    if (t.includes('BOOL')) return 'checkbox';
    if (col.name && (col.name.includes('email') || col.name.includes('mail'))) return 'email';
    if (col.name && (col.name.includes('description') || col.name.includes('note') || col.name.includes('memo'))) return 'textarea';
    return 'text';
  }

  // === Public API ===
  window.App = {
    showHome: showHome,
    openTable: openTable,
    showForm: showForm,
    saveRecord: saveRecord,
    deleteRecord: deleteRecord,
    showCreateTable: showCreateTable,
    addColumnDef: addColumnDef,
    doCreateTable: doCreateTable,
    deleteTable: deleteTable,
    doSearch: doSearch,
    _searchDebounce: (function() {
      var timer = null;
      return function(table) {
        clearTimeout(timer);
        timer = setTimeout(function() {
          var val = document.getElementById('search-input');
          if (val) openTable(table, { search: val.value });
        }, 400);
      };
    })(),
    logout: logout,
    showWizard: showWizard,
    wizardNext: wizardNext,
    wizardSkipRelations: function() {
      var tableName = state._wizardData.tableName;
      state._wizardData = null;
      alert('App created!');
      loadNav();
      openTable(tableName);
    },
    openChildForm: function(childTable, childId, parentTable, parentId, defaults) {
      state.navStack.push({ table: parentTable, id: parentId, screenId: state._currentScreenId });
      showForm(childTable, childId, defaults);
    },
    navBack: function() {
      if (state.navStack.length > 0) {
        var prev = state.navStack.pop();
        if (prev.screenId) state._currentScreenId = prev.screenId;
        showForm(prev.table, prev.id);
      } else {
        openTable(state.currentTable);
      }
    },
    openBuilder: openBuilder,
    openScreen: openScreen,
  };

  // Init
  checkAuth();
})();
