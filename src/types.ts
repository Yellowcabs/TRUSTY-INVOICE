export interface InvoiceData {
  company: {
    name: string;
    logo: string | null;
    address: string;
    phone: string;
    email: string;
    website: string;
    customInfo: string;
  };
  invoice: {
    number: string;
    date: string;
  };
  passenger: {
    name: string;
    phone: string;
  };
  trip: {
    pickup: string;
    drop: string;
  };
  vehicle: {
    type: string;
    number: string;
  };
  fare: {
    distance: number;
    ratePerKm: number;
    baseFare: number;
    advancePaid: number;
    waitingMinutes: number;
    waitingRate: number;
    toll: number;
    permit: number;
    driverBata: number;
    peakCharge: number;
    extraCharges: number;
    hours: number;
    ratePerHour: number;
    extraKms: number;
    extraKmsRate: number;
    surcharge: number;
    dayRent: number;
    hillsCharge: number;
  };
  driver: {
    name: string;
  };
  notes: string;
}

export const VEHICLE_TYPES = [
  'Mini', 
  'Sedan', 
  'Prime Sedan', 
  'SUV', 
  'SUV+', 
  'Innova', 
  'Tempo Traveller', 
  'Tourist Bus', 
  'Coach Bus', 
  'Urbania'
];

export const INITIAL_DATA: InvoiceData = {
  company: {
    name: '',
    logo: null,
    address: '',
    phone: '',
    email: '',
    website: '',
    customInfo: '',
  },
  invoice: {
    number: `INV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toISOString().split('T')[0],
  },
  passenger: {
    name: '',
    phone: '',
  },
  trip: {
    pickup: '',
    drop: '',
  },
  vehicle: {
    type: '',
    number: '',
  },
  fare: {
    distance: 0,
    ratePerKm: 0,
    baseFare: 0,
    advancePaid: 0,
    waitingMinutes: 0,
    waitingRate: 0,
    toll: 0,
    permit: 0,
    driverBata: 0,
    peakCharge: 0,
    extraCharges: 0,
    hours: 0,
    ratePerHour: 0,
    extraKms: 0,
    extraKmsRate: 0,
    surcharge: 0,
    dayRent: 0,
    hillsCharge: 0,
  },
  driver: {
    name: '',
  },
  notes: '',
};
