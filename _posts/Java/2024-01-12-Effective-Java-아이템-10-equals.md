---
title: "Effective Java - 아이템 10: equals는 일반 규약을 지켜 재정의하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### equals를 재정의하지 않는 것이 좋은 상황
1. 각 인스턴스가 본질적으로 고유하다.
- 값을 표현하는게 아니라 동작하는 개체를 표현하는 클래스. Thread가 좋은 예
2. 인스턴스의 '논리적 동치성(logical equality)'을 검사할 일이 없다.
3. 상위 클래스에서 재정의한 equals가 하위 클래스에도 딱 들어맞는다.
- 상위 클래스의 equals를 쓰면 되는데 굳이 하위 클래스에서 오버라이딩 하지 마라.
4. 클래스가 private이거나 package-private이고 eqauls 메서드를 호출할 일이 없다.
```java
// equals가 실수로라도 호출되는 걸 막고 싶다면 이렇게 구현
@Override
public boolean equals(Object object) {
    throw new ArrsertionError(); // 호출 금지
}
```

### equals는 언제 재정의 해야 하는가?
**객체 식별성(object identity 두 객체가 물리적으로 같은가)**이 아니라 논리적 동치성을 확인해야 하는데,<br>
**상위 클래스의 equals가 논리적 동치성을 비교하도록 재정의되지 않았을 때**다.<br>
주로 Integer와 String처럼 값을 표현하는 클래스들이 여기 해당한다.<br>
두 객체가 같은지 비교하고 싶은 것이 아니라, 두 객체의 값이 같은지 비교하고 싶기 때문이다.<br>

값 클래스라고 해도, 값이 같은 인스턴스가 둘 이상 만들어지지 않음을 보장하는 **인스턴스 통제 클래스**라면 equals를 재정의하지 않아도 된다.
Enum도 여기 해당한다. 이런 클래스에서는 어차피 논리적으로 같은 인스턴스가 2개 이상 만들어지지 않으니,<br>
논리적 동치성과 객체 식별성이 사실상 똑같은 의미가 된다. 따라서 **Object의 equals가 논리적 동치성까지 확인**해준다고 볼 수 있다.<br>

### equals 메서드를 재정의 할 때 따라야 하는 일반 규약
equals 메서드는 동치관계(equivalence relation)를 구현하며, 다음을 만족한다.
- 반사성(reflexivity): `null`이 아닌 모든 참조 값 `x`에 대해, `x.equals(x)`는 `true`다.
- 대칭성(symmetry): `null`이 아닌 모든 참조 값 `x`, `y`에 대해, `x.eqauls(y)`가 `true`면 `y.equals(x)`도 `true`다.
- 추이성(transitivity): `null`이 아닌 모든 참조 값 `x`, `y`, `z`에 대해, `x.equals(y)`가 `true`이고, `y.equals(z)`가 `true`면, `x.equals(z)`도 `true`다.
- 일관성(consistency): `null`이 아닌 모든 참조 값 `x`, `y`에 대해, `x.equals(y)`를 반복해서 호출하면 항상 `true`를 반환하거나 항상 `false`를 반환한다.
- null-아님: `null`이 아닌 모든 참조 값 `x`에 대해, `x.equals(null)`은 `false`다.

### Object 명세에서 말하는 동치관계란?
동치관계란 집합을 서로 같은 원소들로 이뤄진 부분집합으로 나누는 연산이다.<br>
이 부분집합을 **동치류(equivalence class; 동치 클래스)**라 한다.<br>
equals 메서드가 쓸모 있으려면 모든 원소가 같은 동치류에 속한 어떤 원소와도 서로 교환할 수 있어야 한다.

### 동치관계를 만족시키기 위한 다섯 요건
1. 반사성(reflexivity)
- 반사성은 단순히 말하면 객체는 자기 자신과 같아야 한다는 뜻이다.
2. 대칭성(symmetry)
- 대칭성은 두 객체는 서로에 대한 동치 여부에 똑같이 답해야 한다는 뜻이다.

```java
// 대칭성을 위배한 코드
public final class CaseInsensitiveString {
    private final String s;

    public CaseInsensitiveString(String s) {
        this.s = Objects.requireNonNull(s);
    }

    // 대칭성 위배
    @Override
    public boolean equals(Object object) {
        if (o instanceof CaseInsensitiveString) {
            return s.equalsIgnoreCase(((CaseInsensitiveString) o).s);
        }
        if (o instanceof String) { // 한 방향으로만 작동한다
            return s.equalsIgnoreCase((String) o);
        }
        return false;
    }
}
```
위 코드의 `CaseInsensitiveString`클래스는 `String`을 알고있기 때문에 비교가 가능하지만,<br> 
`String` 클래스는 `CaseInsensitiveString`을 모르기 때문에 대칭성에 어긋난다.

```java
CaseInsensitive cis = new CaseInsensitiveString("Polish");
String s = "polish";

cis.equals(s) == true;
s.equals(cis) == false;
```

이 문제를 해결하려면 CaseInsensitiveString의 equals를 String과도 연동하려하면 안된다.

```java
// 수정된 코드
@Override public boolean equals(Object object) {
    return o instanceof CaseInsensitiveString &&
            ((CaseInsensitiveString) o).s.eqaulsIgnoreCase(s);
}
```

3. 추이성(transitivity)
- 추이성은 x가 y와 같고, y가 z와 같다면, x와 z도 같아야 한다는 뜻이다.
- 상위 클래스에 없는 새로운 필드를 하위 클래스에 추가하는 상황에 발생하기 쉽다.

```java
// 상위 클래스
public class Point {
    private final int x;
    private final int y;

    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    @Override public boolean equals(Object o) {
        if (!(o instanceof Point)) {
            return false;
        }
        Point p = (Point) o;
        return p.x == x && p.y == y;
    }
}
```

```java
// Point에 색상을 추가한 하위 클래스
public class ColorPoint extends Point {
    private final Color color;

    public ColorPoint(int x, int y, Color color) {
        super(x, y);
        this.color = color;
    }
}
```

상위 클래스인 Point 클래스의 equals 메서드를 그대로 둔다면, 색상 정보는 무시한 채 비교를 수행한다.

```java
// 색상이 같을 때만 true를 반환하는 equals
// 대칭성을 위배한 잘못된 코드
@Override public boolean equals(Object o) {
    if (!(o instanceof ColorPoint)) {
        return false;
    }
    return super.equals(o) && ((ColorPoint) o).color == color;
}
```
Point의 equals는 색상을 무시하고, ColorPoint의 equals는 입력 매개변수의 클래스 종류가 다르기 때문에 false를 반환할 것이다.

```java
Point p = new Point(1, 2);
ColorPoint cp = new ColorPoint(1, 2, Color.RED);

p.equals(cp) == true;
cp.equals(p) == true;
```

```java
// 색상을 무시하도록 하는 equals
// 추이성 위배
@Override public boolean equals(Object o) {
    if (!(o instanceof Point)) {
        return false;
    }
    
    // o가 일반 Point면 색상을 무시하고 비교한다.
    if (!(o instanceof ColorPoint)) {
        return o.equals(this);
    }
    
    // o가 ColorPoint면 색상까지 비교한다.
    return super.equals(o) && ((ColorPoint) o).color == color;
}
```
이 방식은 대칭성은 지켜주지만 추이성이 깨진다.

```java
ColorPoint p1 = new ColorPoint(1, 2, Color.RED);
Point p2 = new Point(1, 2);
ColorPoint p3 = new ColorPoint(1, 2, Color.BLUE);

p1.equals(p2) == true;
p2,equals(p3) == true;
p1.equals(p3) == false;
```
p1과 p2, p2와 p3 비교에서는 색상을 무시했지만, p1과 p3 비교에서는 색상까지 비교했기 때문에 추이성에 위배된다.<br>
또한 이 방식은 무한 재귀에 빠질 위험도 있다.<br>
**이 현상은 모든 객체지향 언어의 동치관계에서 나타나는 근본적인 문제다.**<br>
**구체 클래스를 확장해 새로운 값을 추가하면서 equals 규약을 만족시킬 방법은 존재하지 않는다.**

equals 안의 instanceof 검사를 getClass 검사로 바꾸면 규약도 지키고 값도 추가하면서 구체 클래스를 상속할 수 있을까?

```java
@Override public boolean equals(Object o) {
    if (o == null || o.getClass() != getClass()) {
        return false;
    }
    Point p = (Point) o;
    return p.x == x && p.y == y;
}
```
이 equals는 같은 구현 클래스의 객체와 비교할 때만 true를 반환한다.<br>
문제는 Point의 하위 클래스는 정의상 여전히 Point이므로 어디서든 Point로써 활용될 수 있어야 한다.<br>
리스코프 치환 원칙(Liskov substitution principle)에 따르면, 어떤 타입에 있어 중요한 속성이라면<br>
그 하위 타입에서도 마찬가지로 중요하다. 따라서 그 타입의 모든 메서드가 하위 타입에서도 독같이 잘 작동해야 한다.<br>
Point의 하위 클래스는 정의상 여전히 Point이므로 어디서든 Point로써 활용될 수 있어야 한다는 말이다.

구체 클래스의 하위 클래스에서 값을 추가할 방법은 없지만 괜찮은 우회 방법이 있는데, **상속 대신 컴포지션을 사용**하는 것이다.
Point를 상속하는 대신 Point를 ColorPoint의 private 필드로 두고,<br> 
ColorPoint와 같은 위치의 일반 Point를 반환하는 뷰(view) 메서드를 public으로 추가하는 식이다.

```java
public class ColorPoint {
    private final Point point;
    private final Color color;

    public ColorPoint(int x, int y, Color color) {
        point = new Point(x, y);
        this.color = Objects.requireNonNull(color);
    }
    
    // 이 ColorPoint의 Point 뷰를 반환한다.
    public Point asPoint() {
        return point;
    } 
    
    @Override public boolean equals(Object o) {
        if (!(o instanceof ColorPoint)) {
            return false;
        }
        ColorPoint cp = (ColorPoint) o;
        return cp.point.equals(point) && cp.color.equals(color);
    }
}
```

4. 일관성(consistency)
- 일관성은 두 객체가 같다면(어느 하나 혹은 두 객체 모두가 수정되지 않는 한) 앞으로 영원히 같아야 한다는 뜻이다.
- 가변 객체는 비교 시점에 따라 서로 다를 수도 혹은 같을 수도 있는 반면, 불변 객체는 한 번 다르면 끝까지 달라야 한다.
- 클래스를 작성할 때는 불변 클래스로 만드는 것이 더 나을지 심사숙고 하자.
- **클래스가 불변이든 가변이든 equals의 판단에 신뢰할 수 없는 자원이 끼어들게 해서는 안된다.**
- equals는 항시 메모리에 존재하는 객체만을 사용한 결정적(deterministic) 계산만 수행해야 한다.

5. null-아님
- 모든 객체가 null과 같지 않아야 한다는 뜻이다.

```java
// 명시적 null 검사 - 필요 없다
@Override public boolean equals(Object o) {
    if (o == null) {
        return false;
    }
}
```
이런 검사는 필요치 않다. 동치성을 검사하려면 equals는 건네받은 객체를 적절히 형변환한 후 필수 필드들의 값을 알아내야 한다.

```java
// 묵시적 null 검사 - 이 쪽이 낫다
@Override public boolean equals(Object o) {
    if (!(o instanceof MyType)) {
        return false;
    }
    MyType mt = (MyType) o;
    ...
}
```
instanceof 연산자가 null 체크를 해준다.

### equals 메서드 구현 방법
1. == 연산자를 사용해 입력이 자기 자신의 참조인지 확인한다.
2. instanceof 연산자로 입력이 올바른 타입인지 확인한다.
- 인터페이스를 구현한 클래스라면(Set, List, Map.Entry ...) equals에서 (클래스가 아닌) 해당 인터페이스를 사용해야 한다.
3. 입력을 올바른 타입으로 형변환한다.
- 2번에서 instanceof 검사를 했기 때문에 100% 성공한다.
4. 입력 객체와 자기 자신의 대응되는 '핵심'필드들이 모두 일치하는지 하나씩 검사한다.
- 2번에서 인터페이스를 사용했다면 입력의 필드 값을 가져올 때도 그 인터페이스의 메서드를 사용해야 한다.

> float와 double을 제외한 기본 타입 필드는 == 연산자로 비교하고, 참조타입 필드는 각각의 equals 메서드로,<br>
> float와 double 필드는 각각 정적 메서드인 Float.compare(float, float)와 Double.compare(double, double)로 비교한다.
> float와 double은 부동소수 값 등을 다뤄야 하기 때문이다. Float.equals, Double.equals를 사용할 수 있지만,
> 이 메서드들은 오토박싱을 수반할 수 있어 성능상 좋지 않다.

equals의 성능을 위해서 **다를 가능성이 더 크거나 비교하는 비용이 싼(혹은 둘 다해당하는) 필드를 먼저 비교하자.**


### 주의사항
1. equals를 재정의할 땐 hashCode도 반드시 재정의하자.
2. 너무 복잡하게 해결하려 들지 말자.
3. Object 외의 타입을 매개변수로 받는 equals 메서드는 선언하지 말자.

```java
// 잘못된 예 - 입력 타입은 반드시 Object여야 한다.
public boolean equals(MyClass o) {
    ...
}
```
이 메서드는 Object.equals를 재정의 한 것이 아니다. 입력 타입이 Object가 아니므로 다중정의다.<br>
@Override 애노테이션을 사용하면 이런 실수를 컴파일 단계에서 확인 가능하다.<br>

### 핵심 정리
**꼭 필요한 경우가 아니면 equals를 재정의하지 말자.**<br>
재정의해야할 때는 그 클래스의 핵심 필드를 모두 빠짐없이, 다섯 규약을 확실히 지켜가며 비교해야 한다.
