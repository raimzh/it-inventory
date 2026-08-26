'use strict';
/**
 * Удаление учётной записи, когда след появился между проверкой и удалением.
 *
 *   npm run test:users-fallback
 *
 * `remove` сначала ищет ссылки на пользователя, и только не найдя ни одной
 * удаляет запись. Между этими двумя шагами след успевает появиться: журнал
 * действий пишется вне транзакции запроса, и запись о выходе ложится ровно
 * туда. База отвечает нарушением внешнего ключа, а наружу уходило 500 на
 * штатное действие.
 *
 * В CI это выглядело как случайное падение `test:users`: тот же коммит
 * проходил на одном прогоне и падал на другом. Гонку по времени тестом не
 * закрепить, поэтому здесь подставляется хранилище, которое бросает ту
 * самую ошибку 23503 — путь проверяется без ожидания и без базы.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { UsersService } = require('../dist/modules/users/users.service');

/**
 * Заглушка сервиса. Метод обращается только к this.findOne, this.repo и
 * this.userReferences, поэтому поднимать модуль с зависимостями незачем —
 * тот же приём, что в excel-import.test.js.
 */
function makeService({ deleteError, references = [{}, {}] }) {
  const calls = { deleted: [], updated: [] };
  let refCall = 0;

  const self = {
    findOne: async id => ({ id, role: 'viewer', isActive: true }),
    userReferences: async () => references[Math.min(refCall++, references.length - 1)],
    repo: {
      count: async () => 1,
      update: async (id, patch) => { calls.updated.push({ id, patch }); },
      delete: async id => {
        calls.deleted.push(id);
        if (deleteError) throw deleteError;
      },
    },
  };
  return { self, calls, remove: id => UsersService.prototype.remove.call(self, id) };
}

function fkError() {
  const err = new Error('update or delete on table "users" violates foreign key constraint');
  err.code = '23503';
  return err;
}

test('след, появившийся между проверкой и удалением, не даёт 500', async () => {
  const svc = makeService({
    deleteError: fkError(),
    // Первая проверка следов не нашла, при повторной запись уже видна
    references: [{}, { 'audit_logs.user_id': 1 }],
  });

  const res = await svc.remove('u1');

  assert.equal(res.deleted, false, 'удалить не вышло — значит и отвечать надо так');
  assert.deepEqual(res.references, { 'audit_logs.user_id': 1 },
    'ответ должен называть, что именно помешало');
  assert.deepEqual(svc.calls.updated, [{ id: 'u1', patch: { isActive: false } }],
    'учётка обязана остаться деактивированной, а не просто уцелеть');
});

test('учётка без следов по-прежнему удаляется полностью', async () => {
  // Основной путь ломать нельзя: иначе записи копились бы вечно
  const svc = makeService({ references: [{}] });

  const res = await svc.remove('u1');

  assert.equal(res.deleted, true);
  assert.deepEqual(svc.calls.deleted, ['u1']);
  assert.equal(svc.calls.updated.length, 0, 'деактивировать удалённую запись незачем');
});

test('найденные следы отрабатывают без попытки удаления', async () => {
  const svc = makeService({ references: [{ 'assets.owner_id': 3 }] });

  const res = await svc.remove('u1');

  assert.equal(res.deleted, false);
  assert.deepEqual(res.references, { 'assets.owner_id': 3 });
  assert.equal(svc.calls.deleted.length, 0, 'заведомо обречённый DELETE слать незачем');
});

test('прочие ошибки базы не выдаются за успешную деактивацию', async () => {
  // Иначе отказ диска или обрыв соединения выглядел бы как штатный ответ,
  // и запись молча оставалась бы активной
  const err = new Error('соединение потеряно');
  err.code = '08006';
  const svc = makeService({ deleteError: err, references: [{}] });

  await assert.rejects(() => svc.remove('u1'), /соединение потеряно/);
  assert.equal(svc.calls.updated.length, 0);
});

test('ошибка без кода тоже не проглатывается', async () => {
  const svc = makeService({ deleteError: new Error('что-то пошло не так'), references: [{}] });
  await assert.rejects(() => svc.remove('u1'), /что-то пошло не так/);
});
