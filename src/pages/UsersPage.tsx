import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PERMISSIONS, permissionLabels } from '../auth/permissions'
import type { Permission } from '../auth/permissions'
import { Modal } from '../components/Modal'
import { PhoneInput } from '../components/PhoneInput'
import { EmptyState } from '../components/EmptyState'

type Role = 'ADMIN' | 'MANAGER'

interface UserRecord {
  id: string
  email: string
  fullName: string
  /** Может быть пустой строкой */
  phone: string
  role: Role
  active: boolean
  permissions: string[]
  createdAt: string
}

const roleLabels: Record<Role, string> = {
  ADMIN: 'Администратор',
  MANAGER: 'Менеджер',
}

const allPermissions = Object.values(PERMISSIONS)

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' })

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [selected, setSelected] = useState<UserRecord | null>(null)

  const loadUsers = async () => {
    try {
      setUsers(await api<UserRecord[]>('/users'))
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить пользователей')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      await loadUsers()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Операция не удалась')
    }
  }

  const removeUser = (user: UserRecord) => {
    if (!window.confirm(`Удалить пользователя ${user.fullName}?`)) return
    void run(() => api(`/users/${user.id}`, { method: 'DELETE' }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Пользователи</h1>
          <p className="mt-1 text-sm text-zinc-500">Сотрудники с доступом к системе</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
          <UserPlus size={16} />
          Добавить пользователя
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
        ) : users.length === 0 ? (
          <EmptyState icon={UserPlus} title="Нет пользователей" description="Добавьте первого сотрудника" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/5">
                <tr>
                  <th className="th">Имя</th>
                  <th className="th">Роль</th>
                  <th className="th">Статус</th>
                  <th className="th">Создан</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelected(user)}
                    className="cursor-pointer transition hover:bg-white/[0.02]"
                  >
                    <td className="td font-medium text-zinc-100">{user.fullName}</td>
                    <td className="td">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.role === 'ADMIN'
                            ? 'bg-emerald-400/10 text-emerald-400'
                            : 'bg-sky-400/10 text-sky-400'
                        }`}
                      >
                        {user.role === 'ADMIN' && <ShieldCheck size={12} />}
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="td">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          user.active ? 'text-emerald-400' : 'text-zinc-500'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            user.active ? 'bg-emerald-400' : 'bg-zinc-500'
                          }`}
                        />
                        {user.active ? 'Активен' : 'Деактивирован'}
                      </span>
                    </td>
                    <td className="td text-zinc-500">
                      {dateFormatter.format(new Date(user.createdAt))}
                    </td>
                    <td className="td text-right">
                      {user.id !== currentUser?.id && (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditing(user)
                            }}
                            title="Редактировать"
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              removeUser(user)
                            }}
                            title="Удалить"
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserDetailsModal
        user={selected}
        onClose={() => setSelected(null)}
        onEdit={(user) => {
          setSelected(null)
          setEditing(user)
        }}
      />

      <UserFormModal
        open={createOpen}
        title="Новый пользователь"
        onClose={() => setCreateOpen(false)}
        onSubmit={async (form) => {
          await api('/users', {
            method: 'POST',
            body: JSON.stringify({
              email: form.email,
              fullName: form.fullName,
              ...(form.phone ? { phone: form.phone } : {}),
              password: form.password,
              role: form.role,
              permissions: form.permissions,
            }),
          })
          setCreateOpen(false)
          await loadUsers()
        }}
      />

      {editing && (
        <UserFormModal
          key={editing.id}
          open
          title={`Редактировать: ${editing.fullName}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (form) => {
            await api(`/users/${editing.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                fullName: form.fullName,
                phone: form.phone,
                role: form.role,
                active: form.active,
                permissions: form.permissions,
                ...(form.password ? { password: form.password } : {}),
              }),
            })
            setEditing(null)
            await loadUsers()
          }}
        />
      )}
    </div>
  )
}

/** Деталь пользователя: контакты, роль, права; кнопка «Изменить» открывает форму редактирования */
function UserDetailsModal({
  user,
  onClose,
  onEdit,
}: {
  user: UserRecord | null
  onClose: () => void
  onEdit: (user: UserRecord) => void
}) {
  if (!user) return null

  return (
    <Modal open title={user.fullName} onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-zinc-500">Email</dt>
          <dd className="text-right text-zinc-300">{user.email}</dd>
          <dt className="text-zinc-500">Телефон</dt>
          <dd className="text-right text-zinc-300">{user.phone || '—'}</dd>
          <dt className="text-zinc-500">Роль</dt>
          <dd className="text-right text-zinc-300">{roleLabels[user.role]}</dd>
          <dt className="text-zinc-500">Статус</dt>
          <dd className={`text-right ${user.active ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {user.active ? 'Активен' : 'Деактивирован'}
          </dd>
          <dt className="text-zinc-500">Создан</dt>
          <dd className="text-right text-zinc-300">
            {dateFormatter.format(new Date(user.createdAt))}
          </dd>
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Права</h3>
          {user.role === 'ADMIN' ? (
            <p className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-zinc-500">
              Все права (администратор)
            </p>
          ) : user.permissions.length > 0 ? (
            <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
              {user.permissions.map((permission) => (
                <li key={permission} className="px-3 py-2.5 text-sm text-zinc-300">
                  {permissionLabels[permission as Permission] ?? permission}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-zinc-600">
              Дополнительных прав нет
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onEdit(user)}
          className="btn-primary w-full justify-center"
        >
          <Pencil size={16} />
          Изменить
        </button>
      </div>
    </Modal>
  )
}

interface UserForm {
  email: string
  fullName: string
  phone: string
  password: string
  role: Role
  active: boolean
  permissions: string[]
}

function UserFormModal({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  initial?: UserRecord
  onClose: () => void
  onSubmit: (form: UserForm) => Promise<void>
}) {
  const [email, setEmail] = useState(initial?.email ?? '')
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(initial?.role ?? 'MANAGER')
  const [active, setActive] = useState(initial?.active ?? true)
  const [permissions, setPermissions] = useState<string[]>(initial?.permissions ?? [])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const togglePermission = (permission: string) => {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission],
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({ email, fullName, phone: phone.trim(), password, role, active, permissions })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">ФИО</label>
          <input
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="input"
            placeholder="Иван Петров"
          />
        </div>
        {!initial && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder="ivan@velo.local"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Телефон (необязательно)</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">
            {initial ? 'Новый пароль (пусто — не менять)' : 'Пароль (мин. 8 символов)'}
          </label>
          <input
            type="password"
            required={!initial}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Роль</label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="input"
          >
            <option value="MANAGER">Менеджер</option>
            <option value="ADMIN">Администратор</option>
          </select>
        </div>
        {initial && (
          <label className="flex items-center gap-2.5 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Активен
          </label>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm text-zinc-400">Дополнительные права</legend>
          <div className="space-y-2">
            {allPermissions.map((permission) => (
              <label key={permission} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={permissions.includes(permission)}
                  onChange={() => togglePermission(permission)}
                  className="h-4 w-4 accent-emerald-500"
                />
                {permissionLabels[permission]}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {initial ? 'Сохранить' : 'Создать'}
        </button>
      </form>
    </Modal>
  )
}
