# Users module

Provides tenant-scoped user administration under `/admin/users` in `admin-api`.
Only `admin` and `direccion` may use these endpoints. Password hashes never leave
the repository boundary, and role/clinic assignments are replaced transactionally.

The module does not create collaborator or patient records. Those relationships
remain owned by their corresponding modules.
