import React from 'react';
import { Folder, User } from '../types';
import { 
  FolderIcon, 
  FolderOpenIcon, 
  ServerIcon, 
  ChevronRightIcon, 
  AccountCircleIcon, 
  LogoutIcon 
} from './Icons';

interface SidebarProps {
  user: User | null;
  folders: Folder[];
  currentFolderId: string;
  onSelectFolder: (id: string) => void;
  expandedFolders: Set<string>;
  onToggleExpand: (id: string) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  folders,
  currentFolderId,
  onSelectFolder,
  expandedFolders,
  onToggleExpand,
  onLogout
}) => {
  
  // 建立以 parent_id 為 Key 的資料夾 Map，將搜尋時間複雜度優化為 O(N)
  const foldersByParentId = React.useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    folders.forEach(f => {
      const pid = f.parent_id || null;
      if (!map.has(pid)) {
        map.set(pid, []);
      }
      map.get(pid)!.push(f);
    });
    return map;
  }, [folders]);

  // 遞迴渲染資料夾節點
  const renderFolderNode = (folder: Folder) => {
    const subFolders = foldersByParentId.get(folder.id) || [];
    const hasChildren = subFolders.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isActive = currentFolderId === folder.id;

    return (
      <li key={folder.id} className="folder-item-wrapper">
        <div 
          className={`folder-link ${isActive ? 'active' : ''}`}
          onClick={() => onSelectFolder(folder.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              onToggleExpand(folder.id);
            }
          }}
        >
          <div className="folder-link-content">
            {hasChildren ? (
              <div 
                className={`folder-toggle-btn ${isExpanded ? 'expanded' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(folder.id);
                }}
              >
                <ChevronRightIcon size={18} />
              </div>
            ) : (
              <div style={{ width: 20 }}></div>
            )}
            {isExpanded && hasChildren ? (
              <FolderOpenIcon className="icon" size={20} />
            ) : (
              <FolderIcon className="icon" size={20} />
            )}
            <span>{folder.name}</span>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <ul className="folder-children">
            {subFolders.map(subFolder => renderFolderNode(subFolder))}
          </ul>
        )}
      </li>
    );
  };

  // 取得根目錄資料夾
  const rootFolders = foldersByParentId.get(null) || [];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <img src="/logo.png" alt="Logo" className="logo-img" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
          <h2>文件管理系統</h2>
        </div>
      </div>

      <div className="sidebar-menu">
        <div className="menu-label">檔案庫</div>
        <div className="folder-tree-container">
          <ul className="folder-list">
            {/* 根目錄虛擬項目 */}
            <li className="folder-item-wrapper">
              <div 
                className={`folder-link ${currentFolderId === '' ? 'active' : ''}`}
                onClick={() => onSelectFolder('')}
              >
                <div className="folder-link-content">
                  <ServerIcon className="icon" size={20} />
                  <span>文件庫</span>
                </div>
              </div>
            </li>

            {/* 動態渲染子目錄 */}
            {rootFolders.map(folder => renderFolderNode(folder))}
          </ul>
        </div>
      </div>

      {user && (
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">
              <AccountCircleIcon size={36} style={{ color: 'var(--accent-blue)' }} />
            </div>
            <div className="user-info">
              <h4>{user.name}</h4>
              <p className="user-meta" style={{ fontSize: '0.75rem', opacity: 0.8, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', margin: '2px 0' }}>
                {user.dept_name || '無部門'} / {user.position || '無職稱'}
              </p>
              <p className="user-role" style={{ fontSize: '0.7rem', opacity: 0.6, margin: 0 }}>{user.role === 'ADMIN' ? '系統管理員' : '一般同仁'}</p>
            </div>
          </div>
          <button className="btn-icon" title="登出" onClick={onLogout}>
            <LogoutIcon size={20} />
          </button>
        </div>
      )}
    </aside>
  );
};
