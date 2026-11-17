/** Response of GET /permissions/modules (defined locally on the web too: it is not part of the shared-types package). */
export interface PermissionActionDef {
  key: string;
  label: string;
}

export interface PermissionModuleDef {
  key: string;
  label: string;
  group: string;
  parent?: string;
  actions: PermissionActionDef[];
}

export interface PermissionTemplate {
  key: string;
  label: string;
  permissions: string[];
}

export interface PermissionModulesResponse {
  modules: PermissionModuleDef[];
  templates: PermissionTemplate[];
}
