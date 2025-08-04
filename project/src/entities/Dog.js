import { createEntityClient } from "../utils/entityWrapper";
import schema from "./Dog.json";
export const Dog = createEntityClient("Dog", schema);
