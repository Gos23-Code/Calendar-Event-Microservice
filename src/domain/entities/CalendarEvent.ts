import { EventType } from '../enums/EventType';

export class CalendarEvent {
  constructor(
    public readonly id: string,
    public userId: string,
    public petId: string | null,
    public title: string,
    public description: string | null,
    public eventType: EventType,
    public startDate: Date,
    public endDate: Date,
    public location: string | null,
    public reminderAt: Date | null,
    public reminderEnabled: boolean,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  // Define el tipo para el método create
  static create(props: {
    userId: string;
    petId: string | null;
    title: string;
    description: string | null;
    eventType: EventType;
    startDate: Date;
    endDate: Date;
    location: string | null;
    reminderAt: Date | null;
    reminderEnabled: boolean;
  }): CalendarEvent {
    return new CalendarEvent(
      crypto.randomUUID(),
      props.userId,
      props.petId,
      props.title,
      props.description,
      props.eventType,
      props.startDate,
      props.endDate,
      props.location,
      props.reminderAt,
      props.reminderEnabled
    );
  }

  update(props: Partial<{
    title: string;
    description: string | null;
    eventType: EventType;
    startDate: Date;
    endDate: Date;
    location: string | null;
    reminderAt: Date | null;
    reminderEnabled: boolean;
  }>): void {
    if (props.title !== undefined) this.title = props.title;
    if (props.description !== undefined) this.description = props.description;
    if (props.eventType !== undefined) this.eventType = props.eventType;
    if (props.startDate !== undefined) this.startDate = props.startDate;
    if (props.endDate !== undefined) this.endDate = props.endDate;
    if (props.location !== undefined) this.location = props.location;
    if (props.reminderAt !== undefined) this.reminderAt = props.reminderAt;
    if (props.reminderEnabled !== undefined) this.reminderEnabled = props.reminderEnabled;
    this.updatedAt = new Date();
  }
}
