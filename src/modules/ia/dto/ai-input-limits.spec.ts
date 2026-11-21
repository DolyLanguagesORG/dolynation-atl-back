import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatRequestDto } from './chat-request.dto';
import { EvaluateReadingDto, MAX_SUMMARY_LENGTH } from '../../readings/dto/readings.dto';
import { SubmitEvaluationDto } from '../../evaluation/dto/submit-evaluation.dto';

const fieldErrors = async (dto: object): Promise<string[]> =>
  (await validate(dto)).map((error) => error.property);

describe('Límites de tamaño en entradas que se envían a la IA', () => {
  const summary = (length: number): string => 'a'.repeat(length);

  it('rechaza resúmenes de más de 5000 caracteres en ambos endpoints de evaluación', async () => {
    const tooLong = summary(MAX_SUMMARY_LENGTH + 1);

    expect(
      await fieldErrors(plainToInstance(EvaluateReadingDto, { userResponse: tooLong })),
    ).toContain('userResponse');
    expect(
      await fieldErrors(
        plainToInstance(SubmitEvaluationDto, { readingId: 1, userResponse: tooLong }),
      ),
    ).toContain('userResponse');
  });

  it('acepta un resumen de exactamente 5000 caracteres', async () => {
    expect(
      await fieldErrors(
        plainToInstance(EvaluateReadingDto, { userResponse: summary(MAX_SUMMARY_LENGTH) }),
      ),
    ).toEqual([]);
  });

  it('limita systemPrompt, la cantidad de mensajes y el tamaño de cada mensaje en /ia/chat', async () => {
    const message = { role: 'user', content: 'hola' };

    expect(
      await fieldErrors(
        plainToInstance(ChatRequestDto, { messages: [message], systemPrompt: 'x'.repeat(2001) }),
      ),
    ).toContain('systemPrompt');
    expect(
      await fieldErrors(plainToInstance(ChatRequestDto, { messages: Array(21).fill(message) })),
    ).toContain('messages');
    expect(
      await fieldErrors(
        plainToInstance(ChatRequestDto, {
          messages: [{ role: 'user', content: 'x'.repeat(8001) }],
        }),
      ),
    ).toContain('messages');
  });

  it('acepta la petición que hace hoy el front para la explicación detallada', async () => {
    expect(
      await fieldErrors(
        plainToInstance(ChatRequestDto, {
          systemPrompt:
            'You are a English language coach for DolyNation learners (target level: medium). Write strictly in natural English.',
          messages: [{ role: 'user', content: 'Deepen the explanation of "ubiquitous".' }],
        }),
      ),
    ).toEqual([]);
  });
});
