class ManagementError(Exception):
    """基础管理域错误。"""


class ResourceNotFoundError(ManagementError):
    """请求引用的资源不存在。"""


class DuplicateResourceError(ManagementError):
    """同一作用域内资源 key 重复。"""


class ResourceConflictError(ManagementError):
    """请求资源之间的归属关系冲突。"""


class ResourceIntegrityError(ManagementError):
    """数据库完整性约束冲突，且无法归类为重复 key 或缺失引用。"""
