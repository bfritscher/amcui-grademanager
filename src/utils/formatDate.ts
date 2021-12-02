import { date } from 'quasar';

export default function formatDate(value:string|number|undefined, formatString='DD/MM/YYYY HH:mm:ss'):string {
    if (value === undefined) {
        return '';
    }
    if (typeof value === 'string' && !Number.isNaN(Number(value))) {
        value = Number(value);
    }
    return date.formatDate(value, formatString);
}
