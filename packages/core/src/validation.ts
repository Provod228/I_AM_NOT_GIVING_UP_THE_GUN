import type { Address } from './types';

export function validateAddress(a: Partial<Address> | null): string[] {
    const errors: string[] = [];
    if (!a) return ['Адрес не заполнен'];
    if (!a.country?.trim()) errors.push('Укажите страну');
    if (!a.city?.trim()) errors.push('Укажите город');
    if (!a.street?.trim()) errors.push('Укажите улицу');
    if (!a.zip?.trim() || !/^\d{5,6}$/.test(a.zip)) errors.push('Некорректный индекс');
    return errors;
}